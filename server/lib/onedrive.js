// ============================================================================
// OneDrive integration via Microsoft Graph API
//
// Auth model: Azure App Registration with "Application" permissions
// (Files.ReadWrite.All), so we authenticate as the *app* (not as a user)
// using a client secret. Files are stored in a single dedicated user's
// OneDrive (configured via ONEDRIVE_USER_ID).
//
// Why this model: it lets the server upload files without ever needing the
// engineer to be a Microsoft user. They sign in with Google for identity,
// the server stores their submission to ONE central OneDrive that you own.
// ============================================================================

require('isomorphic-fetch'); // required by @microsoft/microsoft-graph-client
const { ConfidentialClientApplication } = require('@azure/msal-node');
const { Client } = require('@microsoft/microsoft-graph-client');
const { cleanEnv } = require('./clean-env');

const TENANT_ID = cleanEnv(process.env.AZURE_TENANT_ID);
const CLIENT_ID = cleanEnv(process.env.AZURE_CLIENT_ID);
const CLIENT_SECRET = cleanEnv(process.env.AZURE_CLIENT_SECRET);
const USER_ID = cleanEnv(process.env.ONEDRIVE_USER_ID);
const ROOT_FOLDER = cleanEnv(process.env.ONEDRIVE_ROOT_FOLDER) || 'Metfraa-EHS';

let msalApp;
function getMsalApp() {
  if (!msalApp) {
    msalApp = new ConfidentialClientApplication({
      auth: {
        clientId: CLIENT_ID,
        authority: `https://login.microsoftonline.com/${TENANT_ID}`,
        clientSecret: CLIENT_SECRET,
      },
    });
  }
  return msalApp;
}

let cachedToken = null;
let cachedTokenExpiry = 0;

async function getAccessToken() {
  // MSAL caches internally too, but we add a cheap layer to skip the call entirely
  if (cachedToken && Date.now() < cachedTokenExpiry - 60_000) {
    return cachedToken;
  }
  const result = await getMsalApp().acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
  });
  cachedToken = result.accessToken;
  cachedTokenExpiry = result.expiresOn ? new Date(result.expiresOn).getTime() : Date.now() + 50 * 60 * 1000;
  return cachedToken;
}

function getGraphClient() {
  return Client.init({
    authProvider: async (done) => {
      try {
        const token = await getAccessToken();
        done(null, token);
      } catch (err) {
        done(err, null);
      }
    },
  });
}

// ----------------------------------------------------------------------------
// Path helpers — Graph API expects paths like /drive/root:/folder/sub:/...
// ----------------------------------------------------------------------------

function driveRootPath() {
  // We always work inside a single user's OneDrive
  return `/users/${USER_ID}/drive`;
}

function itemByPath(relativePath) {
  // relativePath like "01-Toolbox-Talks/Reports/2026/04/file.pdf"
  // Graph wants:  /users/{id}/drive/root:/01-Toolbox-Talks/...:
  const cleaned = relativePath.replace(/^\/+/, '');
  return `${driveRootPath()}/root:/${encodeURIComponent(ROOT_FOLDER)}/${cleaned.split('/').map(encodeURIComponent).join('/')}`;
}

function folderByPath(relativeFolder) {
  const cleaned = relativeFolder.replace(/^\/+|\/+$/g, '');
  if (!cleaned) {
    return `${driveRootPath()}/root:/${encodeURIComponent(ROOT_FOLDER)}`;
  }
  return `${driveRootPath()}/root:/${encodeURIComponent(ROOT_FOLDER)}/${cleaned.split('/').map(encodeURIComponent).join('/')}`;
}

// ----------------------------------------------------------------------------
// Folder creation — creates intermediate folders if missing
// ----------------------------------------------------------------------------

async function ensureFolder(relativeFolder) {
  const client = getGraphClient();
  const segments = [ROOT_FOLDER, ...relativeFolder.split('/').filter(Boolean)];

  let parentPath = '';
  for (const segment of segments) {
    const childPath = parentPath ? `${parentPath}/${segment}` : segment;
    const checkUrl = `${driveRootPath()}/root:/${childPath.split('/').map(encodeURIComponent).join('/')}`;
    try {
      await client.api(checkUrl).get();
      // exists, continue
    } catch (err) {
      if (err.statusCode === 404) {
        // need to create
        const createUnder = parentPath
          ? `${driveRootPath()}/root:/${parentPath.split('/').map(encodeURIComponent).join('/')}:/children`
          : `${driveRootPath()}/root/children`;
        await client.api(createUnder).post({
          name: segment,
          folder: {},
          '@microsoft.graph.conflictBehavior': 'fail',
        }).catch(e => {
          if (e.statusCode !== 409) throw e; // 409 = already exists, race
        });
      } else {
        throw err;
      }
    }
    parentPath = childPath;
  }
}

// ----------------------------------------------------------------------------
// Upload — small files (< 4 MB) use the simple PUT endpoint;
// larger files use an upload session (chunked).
// ----------------------------------------------------------------------------

const SMALL_FILE_LIMIT = 4 * 1024 * 1024;

async function uploadFile(relativePath, buffer, mimeType = 'application/octet-stream') {
  const client = getGraphClient();
  const folder = relativePath.split('/').slice(0, -1).join('/');
  await ensureFolder(folder);

  if (buffer.length <= SMALL_FILE_LIMIT) {
    // Simple upload
    const url = `${itemByPath(relativePath)}:/content`;
    const result = await client
      .api(url)
      .header('Content-Type', mimeType)
      .put(buffer);
    return result;
  }

  // Large-file upload session
  const sessionUrl = `${itemByPath(relativePath)}:/createUploadSession`;
  const session = await client.api(sessionUrl).post({
    item: { '@microsoft.graph.conflictBehavior': 'replace' },
  });
  const uploadUrl = session.uploadUrl;

  const chunkSize = 5 * 1024 * 1024; // 5 MB
  let start = 0;
  let lastResult = null;
  while (start < buffer.length) {
    const end = Math.min(start + chunkSize, buffer.length) - 1;
    const chunk = buffer.subarray(start, end + 1);
    const resp = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': String(chunk.length),
        'Content-Range': `bytes ${start}-${end}/${buffer.length}`,
      },
      body: chunk,
    });
    if (!resp.ok && resp.status !== 202) {
      throw new Error(`Chunk upload failed (${resp.status}): ${await resp.text()}`);
    }
    if (resp.status === 200 || resp.status === 201) {
      lastResult = await resp.json();
    }
    start = end + 1;
  }
  return lastResult;
}

async function downloadFile(relativePath) {
  const client = getGraphClient();
  const url = `${itemByPath(relativePath)}:/content`;
  const stream = await client.api(url).getStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function fileExists(relativePath) {
  const client = getGraphClient();
  try {
    await client.api(itemByPath(relativePath)).get();
    return true;
  } catch (err) {
    if (err.statusCode === 404) return false;
    throw err;
  }
}

// Get file metadata (id, name, size, webUrl, etc.) without downloading content
async function getFileInfo(relativePath) {
  const client = getGraphClient();
  try {
    return await client.api(itemByPath(relativePath)).get();
  } catch (err) {
    if (err.statusCode === 404) return null;
    throw err;
  }
}

// Get a temporary download URL that bypasses auth (good for proxying large
// files without buffering them in our memory). Microsoft generates a short-lived
// pre-signed URL we can fetch from anonymously.
async function getDownloadUrl(relativePath) {
  const info = await getFileInfo(relativePath);
  if (!info) return null;
  return info['@microsoft.graph.downloadUrl'] || null;
}

// List the immediate children of a folder. Returns array of DriveItem objects
// from Microsoft Graph (each has name, size, file/folder, @microsoft.graph.downloadUrl).
async function listFolder(relativeFolder) {
  const client = getGraphClient();
  const url = `${folderByPath(relativeFolder)}:/children`;
  try {
    const result = await client.api(url).get();
    return result.value || [];
  } catch (err) {
    if (err.statusCode === 404) return [];
    throw err;
  }
}

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

module.exports = {
  ensureFolder,
  uploadFile,
  downloadFile,
  fileExists,
  getFileInfo,
  getDownloadUrl,
  listFolder,
  ROOT_FOLDER,
};

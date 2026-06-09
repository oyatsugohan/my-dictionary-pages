import { PublicClientApplication, type Configuration, type RedirectRequest } from "@azure/msal-browser";
import { Client } from "@microsoft/microsoft-graph-client";
import { db } from "./db";

// Microsoft Auth Config
// Priority: localStorage > .env > fallback
const getClientId = () => {
  const stored = localStorage.getItem('msal_client_id');
  if (stored) return stored;
  const env = import.meta.env.VITE_MSAL_CLIENT_ID;
  if (env && env !== "YOUR_CLIENT_ID_HERE") return env;
  return "00000000-0000-0000-0000-000000000000";
};

const msalConfig: Configuration = {
  auth: {
    clientId: getClientId(),
    authority: "https://login.microsoftonline.com/common",
    // Use the base path from window location
    redirectUri: window.location.origin + "/",
  },
  cache: {
    cacheLocation: "sessionStorage",
  },
};

export const msalInstance = new PublicClientApplication(msalConfig);

// Re-initialize MSAL if the client ID changes
export const reconfigureMsal = async (newClientId: string) => {
  localStorage.setItem('msal_client_id', newClientId);
  // In a real SPA, we might need to reload or carefully re-instantiate.
  // For simplicity here, we'll advise a reload or just update the config if possible.
  window.location.reload(); 
};

// Keep track of initialization to avoid calling methods before it's ready
let initializationPromise: Promise<void> | null = null;

export const ensureInitialized = async () => {
  if (!initializationPromise) {
    try {
      initializationPromise = msalInstance.initialize();
    } catch (error) {
      console.error("MSAL Initialize Error:", error);
      initializationPromise = Promise.resolve();
    }
  }
  await initializationPromise;

  const config = msalInstance.getConfiguration();
  const currentClientId = config.auth.clientId;

  if (!currentClientId || currentClientId === "00000000-0000-0000-0000-000000000000") {
    console.warn("Microsoft Auth: Client ID is not configured. Cloud sync will not work.");
    return;
  }
};

export const loginRequest: RedirectRequest = {
  scopes: ["User.Read", "Files.ReadWrite.AppFolder"],
};

// Get Graph Client
const getGraphClient = (accessToken: string) => {
  return Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    },
  });
};

// Sync with OneDrive
export const syncToOneDrive = async () => {
  await ensureInitialized();
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length === 0) return;

  try {
    const response = await msalInstance.acquireTokenSilent({
      ...loginRequest,
      account: accounts[0],
    });

    const graphClient = getGraphClient(response.accessToken);
    const articles = await db.articles.toArray();
    const content = JSON.stringify(articles);

    // Upload to Apps/MyDictionaryPages/backup.json
    await graphClient
      .api("/me/drive/special/approot:/backup.json:/content")
      .put(content);
    
    console.log("OneDrive Sync Successful");
  } catch (error) {
    console.error("OneDrive Sync Error", error);
  }
};

// Load from OneDrive
export const loadFromOneDrive = async () => {
  await ensureInitialized();
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length === 0) return;

  try {
    const response = await msalInstance.acquireTokenSilent({
      ...loginRequest,
      account: accounts[0],
    });

    const graphClient = getGraphClient(response.accessToken);
    
    // Download from Apps/MyDictionaryPages/backup.json
    const fileStream = await graphClient
      .api("/me/drive/special/approot:/backup.json:/content")
      .get();

    // Browser returns a blob/text
    const text = await (new Response(fileStream)).text();
    const data = JSON.parse(text);

    if (Array.isArray(data)) {
      await db.articles.clear();
      for (const item of data) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, ...rest } = item;
        await db.articles.add(rest);
      }
      return true;
    }
  } catch (error) {
    // If file doesn't exist yet, it's fine
    console.warn("No backup found on OneDrive or error loading", error);
  }
  return false;
};

// Backward-compatible endpoint for older staff login clients.
// Keep one authentication implementation so role/session behavior stays identical.
export { POST } from "../auth/login/route";

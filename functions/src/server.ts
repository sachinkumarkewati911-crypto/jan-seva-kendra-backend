// Standalone entry — free hosts (Render/Railway/Fly) ke liye.
// Koi Blaze/card nahi chahiye. PORT host deta hai.
import app from './app';

const port = Number(process.env.PORT) || 8080;
app.listen(port, () => console.log(`Jan Seva Kendra API listening on :${port}`));

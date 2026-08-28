const { 
  makeWASocket, 
  useMultiFileAuthState, 
  DisconnectReason, 
  fetchLatestBaileysVersion 
} = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

class WhatsAppClient {
  constructor() {
    this.sock = null;
    this.qrCode = null;
    this.status = 'DISCONNECTED'; // DISCONNECTED, CONNECTING, CONNECTED
    this.userInfo = null;
    this.io = null;
  }

  setSocketIO(io) {
    this.io = io;
  }

  broadcast(event, data) {
    if (this.io) {
      this.io.emit(event, data);
    }
  }

  async initialize() {
    try {
      this.status = 'CONNECTING';
      this.broadcast('status_update', { status: this.status });

      const authFolder = path.join(__dirname, '../../baileys_auth_info');
      if (!fs.existsSync(authFolder)) {
        fs.mkdirSync(authFolder, { recursive: true });
      }

      const { state, saveCreds } = await useMultiFileAuthState(authFolder);
      const { version } = await fetchLatestBaileysVersion();

      this.sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: true,
        browser: ['WhatsApp Scheduler Dashboard', 'Chrome', '1.0.0']
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            this.qrCode = await QRCode.toDataURL(qr);
            this.status = 'CONNECTING';
            this.broadcast('qr', { qr: this.qrCode });
            this.broadcast('status_update', { status: this.status });
          } catch (err) {
            console.error('Failed to generate QR code data URL', err);
          }
        }

        if (connection === 'close') {
          const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
          console.log('Connection closed. Reason:', lastDisconnect?.error, 'Reconnecting:', shouldReconnect);
          this.status = 'DISCONNECTED';
          this.qrCode = null;
          this.userInfo = null;
          this.broadcast('status_update', { status: this.status });

          if (shouldReconnect) {
            setTimeout(() => this.initialize(), 3000);
          }
        } else if (connection === 'open') {
          console.log('✅ WhatsApp Web Connection successfully established!');
          this.status = 'CONNECTED';
          this.qrCode = null;
          
          if (this.sock.user) {
            this.userInfo = {
              id: this.sock.user.id,
              name: this.sock.user.name || this.sock.user.notify || 'WhatsApp User',
              phone: this.sock.user.id.split(':')[0]
            };
          }

          this.broadcast('status_update', { 
            status: this.status, 
            user: this.userInfo 
          });
        }
      });

    } catch (error) {
      console.error('❌ WhatsApp Connection Error:', error);
      this.status = 'DISCONNECTED';
      this.broadcast('status_update', { status: this.status, error: error.message });
    }
  }

  getStatus() {
    return {
      status: this.status,
      qr: this.qrCode,
      user: this.userInfo
    };
  }

  async logout() {
    try {
      if (this.sock) {
        await this.sock.logout();
      }
      const authFolder = path.join(__dirname, '../../baileys_auth_info');
      if (fs.existsSync(authFolder)) {
        fs.rmSync(authFolder, { recursive: true, force: true });
      }
      this.status = 'DISCONNECTED';
      this.qrCode = null;
      this.userInfo = null;
      this.broadcast('status_update', { status: this.status });
      setTimeout(() => this.initialize(), 2000);
      return { success: true };
    } catch (err) {
      console.error('Logout error:', err);
      return { success: false, error: err.message };
    }
  }

  formatJid(recipient) {
    let cleaned = recipient.replace(/\D/g, '');
    if (!cleaned.endsWith('@s.whatsapp.net')) {
      cleaned = `${cleaned}@s.whatsapp.net`;
    }
    return cleaned;
  }

  async sendMessage(recipient, textMessage, mediaPath = null) {
    if (this.status !== 'CONNECTED' || !this.sock) {
      throw new Error('WhatsApp client is not connected!');
    }

    const jid = this.formatJid(recipient);

    if (mediaPath && fs.existsSync(mediaPath)) {
      const mediaBuffer = fs.readFileSync(mediaPath);
      const fileName = path.basename(mediaPath);
      const isImage = /\.(jpg|jpeg|png|gif)$/i.test(fileName);

      if (isImage) {
        return await this.sock.sendMessage(jid, {
          image: mediaBuffer,
          caption: textMessage
        });
      } else {
        return await this.sock.sendMessage(jid, {
          document: mediaBuffer,
          mimetype: 'application/octet-stream',
          fileName: fileName,
          caption: textMessage
        });
      }
    } else {
      return await this.sock.sendMessage(jid, { text: textMessage });
    }
  }
}

module.exports = new WhatsAppClient();

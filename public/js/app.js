// WhatsApp Scheduler Frontend App Logic
const socket = io();

// State
let schedulesData = [];
let contactsData = [];
let templatesData = [];
let logsData = [];
let waStatus = 'DISCONNECTED';

// DOM Elements
const waDot = document.getElementById('wa-dot');
const waStatusText = document.getElementById('wa-status-text');
const waUserInfo = document.getElementById('wa-user-info');
const btnWaAction = document.getElementById('btn-wa-action');

// Socket Events
socket.on('status_update', (data) => {
  waStatus = data.status;
  updateStatusUI(data);
});

socket.on('qr', (data) => {
  if (data.qr) {
    document.getElementById('qr-loading').style.display = 'none';
    const qrImg = document.getElementById('qr-image');
    qrImg.src = data.qr;
    qrImg.style.display = 'block';
  }
});

socket.on('schedule_created', () => refreshData());
socket.on('schedule_sent', () => refreshData());
socket.on('schedule_failed', () => refreshData());
socket.on('schedule_deleted', () => refreshData());

// Status UI Update Helper
function updateStatusUI(data) {
  waDot.className = 'dot';
  if (data.status === 'CONNECTED') {
    waDot.classList.add('connected');
    waStatusText.innerText = 'Connected';
    waUserInfo.innerText = data.user ? `Logged in: ${data.user.name}` : '';
    btnWaAction.innerHTML = `<i class="ri-logout-box-r-line"></i> Logout Device`;
    btnWaAction.className = 'btn btn-danger';
  } else if (data.status === 'CONNECTING') {
    waStatusText.innerText = 'Connecting...';
    btnWaAction.innerHTML = `<i class="ri-qr-code-line"></i> Show QR Code`;
    btnWaAction.className = 'btn btn-secondary';
  } else {
    waDot.classList.add('disconnected');
    waStatusText.innerText = 'Disconnected';
    waUserInfo.innerText = '';
    btnWaAction.innerHTML = `<i class="ri-qr-code-line"></i> Connect Device`;
    btnWaAction.className = 'btn btn-secondary';
  }
}

// Navigation Tabs
document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', () => {
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    link.classList.add('active');

    const targetTab = link.getAttribute('data-tab');
    document.querySelectorAll('.tab-content').forEach(content => {
      content.style.display = 'none';
    });

    const activeView = document.getElementById(`view-${targetTab}`);
    if (activeView) activeView.style.display = 'block';

    const pageTitles = {
      dashboard: 'Dashboard Overview',
      schedules: 'Scheduled Messages Queue',
      contacts: 'Contacts Directory',
      templates: 'Message Templates',
      logs: 'System Activity Logs'
    };
    document.getElementById('page-title').innerText = pageTitles[targetTab] || 'Dashboard';
  });
});

// Modal Logic
function openModal(id) {
  document.getElementById(id).classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

document.querySelectorAll('.btn-close-modal, .modal-overlay').forEach(el => {
  el.addEventListener('click', (e) => {
    if (e.target === el || e.target.classList.contains('btn-close-modal') || e.target.classList.contains('modal-close')) {
      document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    }
  });
});

btnWaAction.addEventListener('click', async () => {
  if (waStatus === 'CONNECTED') {
    if (confirm('Are you sure you want to disconnect your WhatsApp Web session?')) {
      await fetch('/api/logout', { method: 'POST' });
    }
  } else {
    openModal('modal-qr');
  }
});

document.getElementById('btn-open-schedule-modal').addEventListener('click', () => {
  // Set default datetime to 10 mins from now
  const now = new Date();
  now.setMinutes(now.getMinutes() + 10);
  document.getElementById('sched-datetime').value = now.toISOString().slice(0, 16);
  openModal('modal-schedule');
});

document.getElementById('btn-open-contact-modal').addEventListener('click', () => openModal('modal-contact'));
document.getElementById('btn-open-template-modal').addEventListener('click', () => openModal('modal-template'));

// API Data Fetching & Rendering
async function refreshData() {
  try {
    const [schedRes, contactRes, tmplRes, logRes] = await Promise.all([
      fetch('/api/schedules').then(r => r.json()),
      fetch('/api/contacts').then(r => r.json()),
      fetch('/api/templates').then(r => r.json()),
      fetch('/api/logs').then(r => r.json())
    ]);

    if (schedRes.success) schedulesData = schedRes.data;
    if (contactRes.success) contactsData = contactRes.data;
    if (tmplRes.success) templatesData = tmplRes.data;
    if (logRes.success) logsData = logRes.data;

    renderStats();
    renderUpcomingTable();
    renderAllSchedulesTable();
    renderContactsTable();
    renderTemplatesTable();
    renderLogsTable();
    populateTemplateDropdown();

  } catch (err) {
    console.error('Error refreshing dashboard data:', err);
  }
}

function renderStats() {
  const pending = schedulesData.filter(s => s.status === 'pending').length;
  const sent = schedulesData.filter(s => s.status === 'sent').length;
  const failed = schedulesData.filter(s => s.status === 'failed').length;

  document.getElementById('stat-pending').innerText = pending;
  document.getElementById('stat-sent').innerText = sent;
  document.getElementById('stat-failed').innerText = failed;
  document.getElementById('stat-contacts').innerText = contactsData.length;
}

function renderUpcomingTable() {
  const tbody = document.getElementById('table-upcoming-body');
  const upcoming = schedulesData.filter(s => s.status === 'pending');
  
  if (upcoming.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--text-muted);">No upcoming scheduled messages.</td></tr>`;
    return;
  }

  tbody.innerHTML = upcoming.map(item => `
    <tr>
      <td><strong>${item.recipient}</strong></td>
      <td>${item.message.length > 50 ? item.message.substring(0, 50) + '...' : item.message}</td>
      <td>${new Date(item.scheduled_at).toLocaleString()}</td>
      <td><span class="badge badge-pending">${item.recurring_type}</span></td>
      <td><span class="badge badge-pending">pending</span></td>
      <td>
        <button class="btn btn-secondary" onclick="sendNow('${item.id}')" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;"><i class="ri-send-plane-line"></i> Send Now</button>
        <button class="btn btn-danger" onclick="deleteSchedule('${item.id}')" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;"><i class="ri-delete-bin-line"></i></button>
      </td>
    </tr>
  `).join('');
}

function renderAllSchedulesTable() {
  const tbody = document.getElementById('table-all-schedules-body');
  if (schedulesData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--text-muted);">No schedules created yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = schedulesData.map(item => `
    <tr>
      <td><strong>${item.recipient}</strong></td>
      <td>${item.message}</td>
      <td>${new Date(item.scheduled_at).toLocaleString()}</td>
      <td>${item.recurring_type}</td>
      <td><span class="badge badge-${item.status}">${item.status}</span></td>
      <td>
        <button class="btn btn-danger" onclick="deleteSchedule('${item.id}')" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;"><i class="ri-delete-bin-line"></i> Delete</button>
      </td>
    </tr>
  `).join('');
}

function renderContactsTable() {
  const tbody = document.getElementById('table-contacts-body');
  if (contactsData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--text-muted);">No saved contacts yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = contactsData.map(c => `
    <tr>
      <td><strong>${c.name}</strong></td>
      <td>${c.phone}</td>
      <td><span class="badge badge-pending">${c.tag}</span></td>
      <td>${new Date(c.created_at).toLocaleDateString()}</td>
      <td>
        <button class="btn btn-danger" onclick="deleteContact('${c.id}')" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;"><i class="ri-delete-bin-line"></i></button>
      </td>
    </tr>
  `).join('');
}

function renderTemplatesTable() {
  const tbody = document.getElementById('table-templates-body');
  if (templatesData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: var(--text-muted);">No templates saved.</td></tr>`;
    return;
  }

  tbody.innerHTML = templatesData.map(t => `
    <tr>
      <td><strong>${t.title}</strong></td>
      <td>${t.content}</td>
      <td><span class="badge badge-pending">${t.category}</span></td>
      <td>
        <button class="btn btn-danger" onclick="deleteTemplate('${t.id}')" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;"><i class="ri-delete-bin-line"></i></button>
      </td>
    </tr>
  `).join('');
}

function renderLogsTable() {
  const tbody = document.getElementById('table-logs-body');
  if (logsData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color: var(--text-muted);">No activity logs yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = logsData.map(l => `
    <tr>
      <td>${new Date(l.timestamp).toLocaleString()}</td>
      <td><span class="badge badge-${l.type === 'SUCCESS' ? 'sent' : 'failed'}">${l.type}</span></td>
      <td>${l.message}</td>
    </tr>
  `).join('');
}

function populateTemplateDropdown() {
  const select = document.getElementById('sched-template-select');
  select.innerHTML = `<option value="">-- Choose Template --</option>` + 
    templatesData.map(t => `<option value="${t.id}">${t.title}</option>`).join('');

  select.onchange = (e) => {
    const tmpl = templatesData.find(t => t.id === e.target.value);
    if (tmpl) {
      document.getElementById('sched-message').value = tmpl.content;
    }
  };
}

// Form Submit Handlers
document.getElementById('form-schedule').addEventListener('submit', async (e) => {
  e.preventDefault();
  const recipient = document.getElementById('sched-recipient').value;
  const message = document.getElementById('sched-message').value;
  const datetime = document.getElementById('sched-datetime').value;
  const recurring = document.getElementById('sched-recurring').value;

  const payload = {
    recipient,
    message,
    scheduled_at: new Date(datetime).toISOString(),
    recurring_type: recurring
  };

  const res = await fetch('/api/schedules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(r => r.json());

  if (res.success) {
    closeModal('modal-schedule');
    document.getElementById('form-schedule').reset();
    refreshData();
  } else {
    alert(res.error || 'Failed to schedule message.');
  }
});

document.getElementById('form-contact').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('contact-name').value;
  const phone = document.getElementById('contact-phone').value;
  const tag = document.getElementById('contact-tag').value;

  const res = await fetch('/api/contacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, phone, tag })
  }).then(r => r.json());

  if (res.success) {
    closeModal('modal-contact');
    document.getElementById('form-contact').reset();
    refreshData();
  }
});

document.getElementById('form-template').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('template-title').value;
  const category = document.getElementById('template-category').value;
  const content = document.getElementById('template-content').value;

  const res = await fetch('/api/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, category, content })
  }).then(r => r.json());

  if (res.success) {
    closeModal('modal-template');
    document.getElementById('form-template').reset();
    refreshData();
  }
});

// Quick Action Functions
async function deleteSchedule(id) {
  if (confirm('Delete this scheduled message?')) {
    await fetch(`/api/schedules/${id}`, { method: 'DELETE' });
    refreshData();
  }
}

async function sendNow(id) {
  await fetch(`/api/schedules/${id}/send-now`, { method: 'POST' });
  refreshData();
}

async function deleteContact(id) {
  if (confirm('Delete this contact?')) {
    await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
    refreshData();
  }
}

async function deleteTemplate(id) {
  if (confirm('Delete this template?')) {
    await fetch(`/api/templates/${id}`, { method: 'DELETE' });
    refreshData();
  }
}

// Sync WhatsApp Contacts Button Event
const btnSync = document.getElementById('btn-sync-contacts');
if (btnSync) {
  btnSync.addEventListener('click', async () => {
    btnSync.disabled = true;
    btnSync.innerHTML = `<i class="ri-loader-4-line ri-spin"></i> Syncing...`;
    try {
      const res = await fetch('/api/contacts/sync', { method: 'POST' }).then(r => r.json());
      if (res.success) {
        alert(`Contacts sync complete! (${res.data.length} contacts found)`);
        refreshData();
      }
    } catch (e) {
      alert('Error syncing contacts: ' + e.message);
    } finally {
      btnSync.disabled = false;
      btnSync.innerHTML = `<i class="ri-refresh-line"></i> Sync WhatsApp Contacts`;
    }
  });
}

// Initial Data Load
refreshData();

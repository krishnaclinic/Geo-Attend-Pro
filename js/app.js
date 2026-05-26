/* ============================================
   Geo Attend Pro — Firebase Edition
   ============================================
   SETUP: Replace the firebaseConfig values below
   with your Firebase project config.
   ============================================ */

// ============================================
// SECTION 1: CONFIG — Replace with your data
// ============================================
const CONFIG = {
  OWNER_EMAIL: 'krishnahospitalsapotra@gmail.com'',
  GEOFENCE_RADIUS: 100,

  // Get this from Firebase Console → Project Settings → General → Your apps → Web app
  firebaseConfig = {
  apiKey: "AIzaSyBumdDi-oOOAoQauLnQDVHJcvbXvJ4nmu0",
  authDomain: "geo-attend-pro.firebaseapp.com",
  projectId: "geo-attend-pro",
  storageBucket: "geo-attend-pro.firebasestorage.app",
  messagingSenderId: "935757975182",
  appId: "1:935757975182:web:a4f77773d67a02034003df"
}
};

// ============================================
// SECTION 2: STATE
// ============================================
const STATE = {
  firebaseUser: null,
  user: null,
  view: 'employee',
  isOwner: false,
  isRegistered: false,

  stores: [],
  employees: [],
  attendance: [],
  todayAttendance: [],

  employeeRecord: null,
  assignedStore: null,
  geoPosition: null,
  geoDistance: null,
  isWithinGeofence: false,
  selfieDataUrl: null,
  currentStatus: null,

  cameraStream: null,

  editingStoreId: null,
  editingEmpEmail: null,

  unsubStores: null,
  unsubEmployees: null,
  unsubAttendance: null
};

// ============================================
// SECTION 3: FIREBASE — Init & Config
// ============================================
const Firebase = {
  app: null,
  auth: null,
  db: null,
  storage: null,

  init() {
    Firebase.app = firebase.initializeApp(CONFIG.firebaseConfig);
    Firebase.auth = firebase.auth();
    Firebase.db = firebase.firestore();
    Firebase.storage = firebase.storage();

    Firebase.db.enablePersistence({ synchronizeTabs: true })
      .catch(err => {
        if (err.code === 'failed-precondition') {
          console.warn('Firestore persistence: multiple tabs open, persistence disabled in this tab');
        } else if (err.code === 'unimplemented') {
          console.warn('Firestore persistence: browser not supported');
        }
      });

    Firebase.auth.onAuthStateChanged(user => {
      if (user) {
        STATE.firebaseUser = user;
        App.handleAuthSuccess(user);
      } else {
        App.handleLogout();
      }
    });
  },

  async uploadSelfie(dataUrl) {
    const blob = dataUrlToBlob(dataUrl);
    const path = `selfies/${STATE.firebaseUser.uid}/${Date.now()}.jpg`;
    const ref = Firebase.storage.ref(path);
    await ref.put(blob, { contentType: 'image/jpeg' });
    return ref.getDownloadURL();
  }
};

function dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(',');
  const mime = parts[0].match(/:(.*?);/)[1];
  const bytes = atob(parts[1]);
  const ab = new ArrayBuffer(bytes.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < bytes.length; i++) ia[i] = bytes.charCodeAt(i);
  return new Blob([ab], { type: mime });
}

// ============================================
// SECTION 4: UTILS
// ============================================
const Utils = {
  showToast(message, type = 'success', duration = 3500) {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerHTML = message;
    c.appendChild(t);
    setTimeout(() => { t.classList.add('toast-out'); setTimeout(() => t.remove(), 300); }, duration);
  },

  showLoading() { document.getElementById('loading-overlay').classList.remove('hidden'); },
  hideLoading() { document.getElementById('loading-overlay').classList.add('hidden'); },

  haversine(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
            + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
            * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  },

  getToday() { return new Date().toISOString().split('T')[0]; },

  formatTime(iso) {
    return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  },

  getDeviceInfo() { return navigator.userAgent.substring(0, 120); },

  getStoreName(storeId) {
    const s = STATE.stores.find(x => x.id === storeId);
    return s ? s.name : '—';
  }
};

// ============================================
// SECTION 5: AUTH — Firebase Email/Password
// ============================================
const Auth = {
  async login() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    if (!email || !password) { Utils.showToast('Enter email and password', 'warning'); return; }
    Utils.showLoading();
    try {
      await Firebase.auth.signInWithEmailAndPassword(email, password);
      Utils.hideLoading();
    } catch (e) {
      Utils.hideLoading();
      const msg = e.code === 'auth/user-not-found' ? 'Account not found. Register first.' :
                  e.code === 'auth/wrong-password' ? 'Wrong password' :
                  e.code === 'auth/invalid-credential' ? 'Invalid email or password' :
                  e.message;
      Utils.showToast(msg, 'error');
    }
  },

  async register() {
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;
    if (!name || !email || !password) { Utils.showToast('Fill all fields', 'warning'); return; }
    if (password.length < 6) { Utils.showToast('Password must be at least 6 characters', 'warning'); return; }
    if (password !== confirm) { Utils.showToast('Passwords do not match', 'warning'); return; }
    Utils.showLoading();
    try {
      const cred = await Firebase.auth.createUserWithEmailAndPassword(email, password);
      await cred.user.updateProfile({ displayName: name });
      Utils.hideLoading();
      Utils.showToast('Account created! Welcome.', 'success');
    } catch (e) {
      Utils.hideLoading();
      Utils.showToast(e.code === 'auth/email-already-in-use' ? 'Email already registered. Sign in.' : e.message, 'error');
    }
  },

  async logout() {
    Staff.closeCamera();
    await Firebase.auth.signOut();
  },

  showRegister() {
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('register-form').classList.remove('hidden');
  },

  showLogin() {
    document.getElementById('register-form').classList.add('hidden');
    document.getElementById('login-form').classList.remove('hidden');
  }
};

// ============================================
// SECTION 6: DB — Firestore Operations + Listeners
// ============================================
const DB = {
  startListeners() {
    DB.stopListeners();

    // Real-time stores listener
    STATE.unsubStores = Firebase.db.collection('stores')
      .onSnapshot(snapshot => {
        STATE.stores = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        if (STATE.view === 'admin') { UI.renderStores(); Admin.updateStats(); }
        if (STATE.view === 'employee') Staff.updateAssignedStore();
      }, err => {
        if (err.code === 'permission-denied') Utils.showToast('Permission denied. Check Firestore rules.', 'error');
      });

    // Real-time employees listener
    STATE.unsubEmployees = Firebase.db.collection('employees')
      .onSnapshot(snapshot => {
        STATE.employees = snapshot.docs.map(d => ({ email: d.id, ...d.data() }));
        if (STATE.firebaseUser) {
          STATE.employeeRecord = STATE.employees.find(e => e.email.toLowerCase() === STATE.firebaseUser.email.toLowerCase());
          STATE.isRegistered = !!STATE.employeeRecord;
        }
        if (STATE.view === 'admin') { UI.renderEmployees(); Admin.updateStats(); UI.populateStoreDropdown(); }
        if (STATE.view === 'employee') UI.renderEmployeeView();
      }, err => {
        if (err.code === 'permission-denied') Utils.showToast('Permission denied. Check Firestore rules.', 'error');
      });

    // Real-time today attendance listener for current user
    if (STATE.firebaseUser) {
      const today = Utils.getToday();
      STATE.unsubAttendance = Firebase.db.collection('attendance')
        .where('email', '==', STATE.firebaseUser.email)
        .where('date', '==', today)
        .orderBy('timestamp', 'asc')
        .onSnapshot(snapshot => {
          STATE.todayAttendance = snapshot.docs.map(d => d.data());
          STATE.todayAttendance.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
          if (STATE.view === 'employee') {
            Staff.updateStatus();
            UI.renderEmployeeView();
          }
        }, err => {
          if (err.code === 'permission-denied') Utils.showToast('Permission denied. Check Firestore rules.', 'error');
          if (err.code === 'failed-precondition') {
            console.warn('Create composite index for attendance query:', err.message);
            Utils.showToast('Set up Firestore index (see error in console)', 'warning');
          }
        });
    }
  },

  stopListeners() {
    if (STATE.unsubStores) { STATE.unsubStores(); STATE.unsubStores = null; }
    if (STATE.unsubEmployees) { STATE.unsubEmployees(); STATE.unsubEmployees = null; }
    if (STATE.unsubAttendance) { STATE.unsubAttendance(); STATE.unsubAttendance = null; }
  },

  async addStore(name, lat, lng) {
    if (!name || isNaN(lat) || isNaN(lng)) { Utils.showToast('Invalid store data', 'error'); return; }
    Utils.showLoading();
    try {
      await Firebase.db.collection('stores').add({ name: name.trim(), lat: parseFloat(lat), lng: parseFloat(lng) });
      Utils.hideLoading();
      Utils.showToast(`Store "${name}" added ✓`);
    } catch (e) {
      Utils.hideLoading();
      Utils.showToast('Failed to add store: ' + e.message, 'error');
    }
  },

  async updateStore(id, name, lat, lng) {
    Utils.showLoading();
    try {
      await Firebase.db.collection('stores').doc(id).update({ name: name.trim(), lat: parseFloat(lat), lng: parseFloat(lng) });
      Utils.hideLoading();
      Utils.showToast('Store updated ✓');
    } catch (e) {
      Utils.hideLoading();
      Utils.showToast('Failed to update store', 'error');
    }
  },

  async deleteStore(id) {
    if (!confirm('Delete this store?')) return;
    Utils.showLoading();
    try {
      await Firebase.db.collection('stores').doc(id).delete();
      Utils.hideLoading();
      Utils.showToast('Store deleted ✓');
    } catch (e) {
      Utils.hideLoading();
      Utils.showToast('Failed to delete store', 'error');
    }
  },

  async addEmployee(name, email, storeId) {
    if (!name || !email || !storeId) { Utils.showToast('Fill all employee fields', 'error'); return; }
    Utils.showLoading();
    try {
      await Firebase.db.collection('employees').doc(email.trim().toLowerCase()).set({
        name: name.trim(), email: email.trim().toLowerCase(), storeId, status: 'Active', createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      Utils.hideLoading();
      Utils.showToast(`Employee "${name}" added ✓`);
    } catch (e) {
      Utils.hideLoading();
      Utils.showToast('Failed to add employee', 'error');
    }
  },

  async deleteEmployee(email) {
    if (!confirm('Delete this employee?')) return;
    Utils.showLoading();
    try {
      await Firebase.db.collection('employees').doc(email).delete();
      Utils.hideLoading();
      Utils.showToast('Employee deleted ✓');
    } catch (e) {
      Utils.hideLoading();
      Utils.showToast('Failed to delete employee', 'error');
    }
  },

  async updateEmployee(oldEmail, name, email, storeId) {
    Utils.showLoading();
    try {
      const oldDoc = Firebase.db.collection('employees').doc(oldEmail);
      const snap = await oldDoc.get();
      if (!snap.exists) { Utils.hideLoading(); Utils.showToast('Employee not found', 'error'); return; }
      if (oldEmail !== email.toLowerCase()) {
        await oldDoc.delete();
        await Firebase.db.collection('employees').doc(email.trim().toLowerCase()).set({
          ...snap.data(), name: name.trim(), email: email.trim().toLowerCase(), storeId
        });
      } else {
        await oldDoc.update({ name: name.trim(), storeId });
      }
      Utils.hideLoading();
      Utils.showToast('Employee updated ✓');
    } catch (e) {
      Utils.hideLoading();
      Utils.showToast('Failed to update employee', 'error');
    }
  },

  async loadAllAttendance() {
    try {
      const snap = await Firebase.db.collection('attendance')
        .orderBy('timestamp', 'desc')
        .limit(200)
        .get();
      STATE.attendance = snap.docs.map(d => d.data());
      if (STATE.view === 'admin') UI.renderAdminAttendance();
    } catch {
      STATE.attendance = [];
    }
  }
};

// ============================================
// SECTION 7: STAFF — Employee Attendance
// ============================================
const Staff = {
  updateAssignedStore() {
    if (STATE.employeeRecord) {
      STATE.assignedStore = STATE.stores.find(s => s.id === STATE.employeeRecord.storeId);
    } else {
      STATE.assignedStore = null;
    }
  },

  updateStatus() {
    if (STATE.todayAttendance.length === 0) { STATE.currentStatus = 'none'; return; }
    const last = STATE.todayAttendance[STATE.todayAttendance.length - 1];
    STATE.currentStatus = last.action === 'IN' ? 'clocked_in' : 'clocked_out';
  },

  async checkGeofence() {
    if (!STATE.assignedStore) {
      UI.setGeoStatus('no-store', 'No store assigned');
      return;
    }
    if (!navigator.geolocation) {
      UI.setGeoStatus('unavailable', 'Geolocation not supported');
      return;
    }
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true, timeout: 15000, maximumAge: 0
        });
      });
      STATE.geoPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      STATE.geoDistance = Utils.haversine(
        STATE.geoPosition.lat, STATE.geoPosition.lng,
        STATE.assignedStore.lat, STATE.assignedStore.lng
      );
      STATE.isWithinGeofence = STATE.geoDistance <= CONFIG.GEOFENCE_RADIUS;
      UI.setGeoStatus(
        STATE.isWithinGeofence ? 'within' : 'outside',
        `${STATE.geoDistance.toFixed(1)}m from ${STATE.assignedStore.name}`
      );
    } catch (e) {
      UI.setGeoStatus('error', e.code === 1 ? 'Location denied. Allow in browser settings.' : 'GPS unavailable');
    }
    Staff.updatePunchButtons();
  },

  async openCamera() {
    try {
      if (STATE.cameraStream) Staff.closeCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 400 }, height: { ideal: 400 } }
      });
      STATE.cameraStream = stream;
      const video = document.getElementById('selfie-video');
      video.srcObject = stream;
      video.classList.remove('hidden');
      document.getElementById('selfie-preview-area').classList.add('hidden');
      document.getElementById('btn-open-camera').classList.add('hidden');
      document.getElementById('btn-capture-selfie').classList.remove('hidden');
      document.getElementById('btn-retake-selfie').classList.add('hidden');
    } catch {
      Utils.showToast('Camera access denied. Allow camera permissions.', 'error');
    }
  },

  closeCamera() {
    if (STATE.cameraStream) {
      STATE.cameraStream.getTracks().forEach(t => t.stop());
      STATE.cameraStream = null;
    }
    const video = document.getElementById('selfie-video');
    video.classList.add('hidden');
    video.srcObject = null;
    document.getElementById('btn-open-camera').classList.remove('hidden');
    document.getElementById('btn-capture-selfie').classList.add('hidden');
    document.getElementById('btn-retake-selfie').classList.add('hidden');
  },

  captureSelfie() {
    const video = document.getElementById('selfie-video');
    const canvas = document.getElementById('selfie-canvas');
    canvas.width = 300;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(video, 0, 0, 300, 300);
    STATE.selfieDataUrl = canvas.toDataURL('image/jpeg', 0.7);
    document.getElementById('selfie-preview-img').src = STATE.selfieDataUrl;
    document.getElementById('selfie-preview-area').classList.remove('hidden');
    video.classList.add('hidden');
    document.getElementById('btn-capture-selfie').classList.add('hidden');
    document.getElementById('btn-retake-selfie').classList.remove('hidden');
    const badge = document.getElementById('selfie-badge');
    badge.className = 'badge badge-emerald';
    badge.textContent = '✓ Captured';
    Staff.updatePunchButtons();
  },

  updatePunchButtons() {
    const canPunch = STATE.isWithinGeofence && STATE.selfieDataUrl;
    document.getElementById('btn-punch-in').disabled = !canPunch;
    document.getElementById('btn-punch-out').disabled = !canPunch;
  },

  async punch(action) {
    if (!STATE.employeeRecord) { Utils.showToast('Not registered. Contact admin.', 'error'); return; }
    if (!STATE.selfieDataUrl) { Utils.showToast('Capture a selfie first', 'warning'); return; }
    if (!STATE.isWithinGeofence) { Utils.showToast('Outside geofence zone', 'warning'); return; }

    Utils.showLoading();
    try {
      let photoUrl = '';
      try { photoUrl = await Firebase.uploadSelfie(STATE.selfieDataUrl); } catch { /* selfie upload optional */ }

      await Firebase.db.collection('attendance').add({
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        date: Utils.getToday(),
        email: STATE.firebaseUser.email,
        name: STATE.employeeRecord.name,
        action,
        photoUrl,
        gps: STATE.geoPosition ? `${STATE.geoPosition.lat},${STATE.geoPosition.lng}` : '',
        storeName: STATE.assignedStore ? STATE.assignedStore.name : '',
        deviceInfo: Utils.getDeviceInfo()
      });

      Utils.hideLoading();
      Utils.showToast(`${action === 'IN' ? 'Punched In' : 'Punched Out'} ✓`);

      STATE.selfieDataUrl = null;
      document.getElementById('selfie-preview-area').classList.add('hidden');
      const badge = document.getElementById('selfie-badge');
      badge.className = 'badge badge-amber';
      badge.textContent = 'Required';
      Staff.closeCamera();
      Staff.updatePunchButtons();
    } catch (e) {
      Utils.hideLoading();
      Utils.showToast('Failed to save: ' + e.message, 'error');
    }
  },

  checkOnline() {
    const bar = document.getElementById('offline-bar');
    if (!navigator.onLine) {
      bar.classList.remove('hidden');
      document.getElementById('offline-count').textContent = 'Firestore will sync when reconnected';
    } else {
      bar.classList.add('hidden');
    }
  }
};

// ============================================
// SECTION 8: ADMIN — Management
// ============================================
const Admin = {
  async load() {
    Admin.updateStats();
    UI.renderStores();
    UI.renderEmployees();
    await DB.loadAllAttendance();
    UI.populateStoreDropdown();
  },

  updateStats() {
    const today = Utils.getToday();
    const todayIn = STATE.todayAttendance.filter(r => r.action === 'IN');
    const uniqueToday = new Set(todayIn.map(r => r.email)).size;
    document.getElementById('stat-today').textContent = uniqueToday;
    document.getElementById('stat-stores').textContent = STATE.stores.length;
    document.getElementById('stat-employees').textContent = STATE.employees.length;
  },

  async exportCSV() {
    await DB.loadAllAttendance();
    if (STATE.attendance.length === 0) { Utils.showToast('No records to export', 'info'); return; }
    const headers = ['Date', 'Time', 'Email', 'Name', 'Action', 'GPS', 'Store', 'Device'];
    const rows = STATE.attendance.map(r => [
      r.date, new Date(r.timestamp?.toMillis ? r.timestamp.toMillis() : r.timestamp).toLocaleTimeString('en-US', { hour12: false }),
      r.email, r.name || '', r.action, r.gps || '', r.storeName || '', (r.deviceInfo || '').substring(0, 50)
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `attendance_${Utils.getToday()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    Utils.showToast('CSV exported ✓');
  }
};

// ============================================
// SECTION 9: UI — DOM Rendering
// ============================================
const UI = {
  showView(view) {
    STATE.view = view;
    document.getElementById('employee-view').classList.toggle('hidden', view !== 'employee');
    document.getElementById('admin-view').classList.toggle('hidden', view !== 'admin');
    document.getElementById('btn-switch-admin').classList.toggle('hidden', !(STATE.isOwner && view === 'employee'));
    document.getElementById('btn-switch-employee').classList.toggle('hidden', !(STATE.isOwner && view === 'admin'));

    if (view === 'admin') Admin.load();
    if (view === 'employee') { Staff.updateAssignedStore(); UI.renderEmployeeView(); }
  },

  renderEmployeeView() {
    if (!STATE.isRegistered) {
      document.getElementById('emp-store').textContent = 'Not Registered';
      document.getElementById('emp-store').style.color = 'var(--danger)';
      document.getElementById('emp-status-text').textContent = 'Contact Admin';
      document.getElementById('emp-status-text').className = 'status-text status-text-idle';
      document.getElementById('emp-trusted-time').textContent = 'Your email is not in the employee list';
      document.getElementById('emp-status-dot').className = 'status-dot';
      return;
    }
    Staff.updateAssignedStore();
    document.getElementById('emp-store').textContent = STATE.assignedStore ? STATE.assignedStore.name : 'No store assigned';
    document.getElementById('emp-store').style.color = '';

    const st = STATE.currentStatus;
    const textEl = document.getElementById('emp-status-text');
    const dotEl = document.getElementById('emp-status-dot');
    const timeEl = document.getElementById('emp-trusted-time');

    if (st === 'clocked_in') {
      const last = STATE.todayAttendance[STATE.todayAttendance.length - 1];
      textEl.textContent = `Shift Started at ${Utils.formatTime(last.timestamp?.toMillis ? last.timestamp.toMillis() : last.timestamp)}`;
      textEl.className = 'status-text status-text-in';
      dotEl.className = 'status-dot status-dot-active';
    } else if (st === 'clocked_out') {
      const last = STATE.todayAttendance[STATE.todayAttendance.length - 1];
      textEl.textContent = `Shift Ended at ${Utils.formatTime(last.timestamp?.toMillis ? last.timestamp.toMillis() : last.timestamp)}`;
      textEl.className = 'status-text status-text-out';
      dotEl.className = 'status-dot';
    } else {
      textEl.textContent = 'Shift Not Started';
      textEl.className = 'status-text status-text-idle';
      dotEl.className = 'status-dot';
    }
    timeEl.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    Staff.checkGeofence();
    Staff.checkOnline();
    UI.renderAttendanceHistory();
  },

  setGeoStatus(status, detail) {
    const icon = document.getElementById('emp-geo-icon');
    const statusEl = document.getElementById('emp-geo-status');
    const detailEl = document.getElementById('emp-geo-detail');
    if (status === 'within') {
      icon.textContent = '✅';
      statusEl.textContent = '✓ Within geofence';
      statusEl.style.color = 'var(--success)';
      detailEl.textContent = detail;
    } else if (status === 'outside') {
      icon.textContent = '❌';
      statusEl.textContent = `✕ ${STATE.geoDistance.toFixed(0)}m away (limit ${CONFIG.GEOFENCE_RADIUS}m)`;
      statusEl.style.color = 'var(--danger)';
      detailEl.textContent = detail;
    } else if (status === 'no-store') {
      icon.textContent = '⚠️';
      statusEl.textContent = 'No store assigned';
      statusEl.style.color = 'var(--warning)';
      detailEl.textContent = 'Contact your admin';
    } else if (status === 'error') {
      icon.textContent = '⚠️';
      statusEl.textContent = 'Location unavailable';
      statusEl.style.color = 'var(--warning)';
      detailEl.textContent = detail;
    } else {
      icon.textContent = '⏳';
      statusEl.textContent = 'Checking location...';
      statusEl.style.color = 'var(--gray-500)';
      detailEl.textContent = detail || 'Acquiring GPS signal...';
    }
    Staff.updatePunchButtons();
  },

  renderAttendanceHistory() {
    const container = document.getElementById('attendance-history');
    if (STATE.todayAttendance.length === 0) {
      container.innerHTML = '<p class="empty-state">No records for today</p>';
      return;
    }
    container.innerHTML = STATE.todayAttendance.map(r => {
      const ts = r.timestamp?.toMillis ? r.timestamp.toMillis() : r.timestamp;
      return `<div class="flex items-center justify-between p-2" style="border-bottom:1px solid var(--gray-100);">
        <div class="flex items-center gap-2">
          <span style="font-size:1.25rem;">${r.action === 'IN' ? '✅' : '❌'}</span>
          <div>
            <span style="font-weight:600;font-size:0.875rem;">${r.action === 'IN' ? 'Punched In' : 'Punched Out'}</span>
            <span style="font-size:0.75rem;color:var(--gray-400);margin-left:0.5rem;">${Utils.formatTime(ts)}</span>
          </div>
        </div>
        <span style="font-size:0.75rem;color:var(--gray-400);">${r.storeName || ''}</span>
      </div>`;
    }).join('');
  },

  renderStores() {
    const list = document.getElementById('store-list');
    if (STATE.stores.length === 0) {
      list.innerHTML = '<p class="empty-state">No stores yet. Add one above.</p>';
      return;
    }
    list.innerHTML = STATE.stores.map(s => `
      <div class="list-item">
        <div class="list-item-content">
          <div class="list-item-title">${s.name}</div>
          <div class="list-item-sub">${s.lat}, ${s.lng}</div>
        </div>
        <div class="list-item-actions">
          <button class="btn btn-sm btn-primary edit-store" data-id="${s.id}" data-name="${s.name}" data-lat="${s.lat}" data-lng="${s.lng}">Edit</button>
          <button class="btn btn-sm btn-danger delete-store" data-id="${s.id}">Del</button>
        </div>
      </div>
    `).join('');
  },

  renderEmployees() {
    const list = document.getElementById('emp-list');
    if (STATE.employees.length === 0) {
      list.innerHTML = '<p class="empty-state">No employees yet. Add one above.</p>';
      return;
    }
    list.innerHTML = STATE.employees.map(e => `
      <div class="list-item">
        <div class="list-item-content">
          <div class="list-item-title">${e.name}</div>
          <div class="list-item-sub">${e.email} · ${Utils.getStoreName(e.storeId)}</div>
        </div>
        <div class="list-item-actions">
          <button class="btn btn-sm btn-primary edit-emp" data-email="${e.email}" data-name="${e.name}" data-store="${e.storeId}">Edit</button>
          <button class="btn btn-sm btn-danger delete-emp" data-email="${e.email}">Del</button>
        </div>
      </div>
    `).join('');
  },

  renderAdminAttendance() {
    const body = document.getElementById('admin-attendance-body');
    if (STATE.attendance.length === 0) {
      body.innerHTML = '<tr><td colspan="5" class="text-center" style="color:var(--gray-400);padding:1rem;">No records</td></tr>';
      return;
    }
    body.innerHTML = STATE.attendance.map(r => {
      const ts = r.timestamp?.toMillis ? r.timestamp.toMillis() : r.timestamp;
      return `<tr>
        <td>${r.date}</td>
        <td>${Utils.formatTime(ts)}</td>
        <td>${r.name || r.email}</td>
        <td><span style="color:${r.action === 'IN' ? 'var(--success)' : 'var(--danger)'};font-weight:600;">${r.action}</span></td>
        <td>${r.storeName || ''}</td>
      </tr>`;
    }).join('');
  },

  populateStoreDropdown() {
    const select = document.getElementById('input-emp-store');
    if (!select) return;
    const val = select.value;
    select.innerHTML = '<option value="">Select Store</option>';
    STATE.stores.forEach(s => {
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = s.name;
      select.appendChild(o);
    });
    if (val) select.value = val;
  }
};

// ============================================
// SECTION 10: APP — Initialization
// ============================================
const App = {
  init() {
    Firebase.init();

    document.getElementById('btn-login').addEventListener('click', () => Auth.login());
    document.getElementById('link-show-register').addEventListener('click', e => { e.preventDefault(); Auth.showRegister(); });
    document.getElementById('link-show-login').addEventListener('click', e => { e.preventDefault(); Auth.showLogin(); });
    document.getElementById('btn-register').addEventListener('click', () => Auth.register());

    document.getElementById('login-password').addEventListener('keydown', e => { if (e.key === 'Enter') Auth.login(); });
    document.getElementById('reg-confirm').addEventListener('keydown', e => { if (e.key === 'Enter') Auth.register(); });

    document.getElementById('btn-logout').addEventListener('click', () => Auth.logout());
    document.getElementById('btn-switch-admin').addEventListener('click', () => UI.showView('admin'));
    document.getElementById('btn-switch-employee').addEventListener('click', () => UI.showView('employee'));

    document.getElementById('btn-show-store-form').addEventListener('click', () => {
      STATE.editingStoreId = null;
      ['input-store-name', 'input-store-lat', 'input-store-lng'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('store-form-area').classList.toggle('hidden');
    });
    document.getElementById('btn-cancel-store').addEventListener('click', () => {
      document.getElementById('store-form-area').classList.add('hidden');
      STATE.editingStoreId = null;
    });
    document.getElementById('btn-save-store').addEventListener('click', () => {
      const name = document.getElementById('input-store-name').value.trim();
      const lat = document.getElementById('input-store-lat').value;
      const lng = document.getElementById('input-store-lng').value;
      if (STATE.editingStoreId) {
        DB.updateStore(STATE.editingStoreId, name, lat, lng);
        STATE.editingStoreId = null;
      } else {
        DB.addStore(name, lat, lng);
      }
      document.getElementById('store-form-area').classList.add('hidden');
      ['input-store-name', 'input-store-lat', 'input-store-lng'].forEach(id => document.getElementById(id).value = '');
    });

    document.getElementById('btn-show-emp-form').addEventListener('click', () => {
      STATE.editingEmpEmail = null;
      document.getElementById('input-emp-name').value = '';
      document.getElementById('input-emp-email').value = '';
      UI.populateStoreDropdown();
      document.getElementById('emp-form-area').classList.toggle('hidden');
    });
    document.getElementById('btn-cancel-emp').addEventListener('click', () => {
      document.getElementById('emp-form-area').classList.add('hidden');
      STATE.editingEmpEmail = null;
    });
    document.getElementById('btn-save-emp').addEventListener('click', () => {
      const name = document.getElementById('input-emp-name').value.trim();
      const email = document.getElementById('input-emp-email').value.trim();
      const storeId = document.getElementById('input-emp-store').value;
      if (STATE.editingEmpEmail) {
        DB.updateEmployee(STATE.editingEmpEmail, name, email, storeId);
        STATE.editingEmpEmail = null;
      } else {
        DB.addEmployee(name, email, storeId);
      }
      document.getElementById('emp-form-area').classList.add('hidden');
      document.getElementById('input-emp-name').value = '';
      document.getElementById('input-emp-email').value = '';
    });

    document.getElementById('btn-open-camera').addEventListener('click', () => Staff.openCamera());
    document.getElementById('btn-capture-selfie').addEventListener('click', () => Staff.captureSelfie());
    document.getElementById('btn-retake-selfie').addEventListener('click', () => {
      STATE.selfieDataUrl = null;
      document.getElementById('selfie-preview-area').classList.add('hidden');
      const badge = document.getElementById('selfie-badge');
      badge.className = 'badge badge-amber';
      badge.textContent = 'Required';
      Staff.openCamera();
    });

    document.getElementById('btn-punch-in').addEventListener('click', () => Staff.punch('IN'));
    document.getElementById('btn-punch-out').addEventListener('click', () => Staff.punch('OUT'));
    document.getElementById('btn-export-csv').addEventListener('click', () => Admin.exportCSV());

    document.getElementById('store-list').addEventListener('click', e => {
      const edit = e.target.closest('.edit-store');
      const del = e.target.closest('.delete-store');
      if (edit) {
        STATE.editingStoreId = edit.dataset.id;
        document.getElementById('input-store-name').value = edit.dataset.name;
        document.getElementById('input-store-lat').value = edit.dataset.lat;
        document.getElementById('input-store-lng').value = edit.dataset.lng;
        document.getElementById('store-form-area').classList.remove('hidden');
      }
      if (del) DB.deleteStore(del.dataset.id);
    });

    document.getElementById('emp-list').addEventListener('click', e => {
      const edit = e.target.closest('.edit-emp');
      const del = e.target.closest('.delete-emp');
      if (edit) {
        STATE.editingEmpEmail = edit.dataset.email;
        document.getElementById('input-emp-name').value = edit.dataset.name;
        document.getElementById('input-emp-email').value = edit.dataset.email;
        UI.populateStoreDropdown();
        document.getElementById('input-emp-store').value = edit.dataset.store;
        document.getElementById('emp-form-area').classList.remove('hidden');
      }
      if (del) DB.deleteEmployee(del.dataset.email);
    });

    window.addEventListener('online', () => Staff.checkOnline());
    window.addEventListener('offline', () => Staff.checkOnline());
  },

  handleAuthSuccess(user) {
    STATE.isOwner = user.email.toLowerCase() === CONFIG.OWNER_EMAIL.toLowerCase();
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('user-area').classList.remove('hidden');
    document.getElementById('user-email').textContent = user.displayName || user.email;

    DB.startListeners();

    if (STATE.isOwner) {
      document.getElementById('btn-switch-admin').classList.remove('hidden');
    }
    UI.showView('employee');
    Utils.showToast(`Welcome, ${user.displayName || user.email}!`, 'success');
  },

  handleLogout() {
    DB.stopListeners();
    STATE.firebaseUser = null;
    STATE.isOwner = false;
    STATE.employeeRecord = null;
    STATE.stores = [];
    STATE.employees = [];
    STATE.attendance = [];
    STATE.todayAttendance = [];

    document.getElementById('user-area').classList.add('hidden');
    document.getElementById('employee-view').classList.add('hidden');
    document.getElementById('admin-view').classList.add('hidden');
    document.getElementById('login-view').classList.remove('hidden');
    document.getElementById('login-form').classList.remove('hidden');
    document.getElementById('register-form').classList.add('hidden');
    document.getElementById('btn-switch-admin').classList.add('hidden');
    document.getElementById('btn-switch-employee').classList.add('hidden');

    document.getElementById('login-email').value = '';
    document.getElementById('login-password').value = '';
    Staff.closeCamera();
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());

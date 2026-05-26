/* ============================================
   Geo Attend Pro — Firebase Edition
   ============================================
   SETUP: Replace firebaseConfig below with your
   Firebase project config from:
   Console → Project Settings → General → Your apps
   ============================================ */

// ============================================
// SECTION 1: CONFIG
// ============================================
const CONFIG = {
  OWNER_EMAIL: 'krishnahospitalsapotra@gmail.com',
  GEOFENCE_RADIUS: 100,

  // Get from Firebase Console → Project Settings → General → Your Web App
  firebaseConfig: {
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

  editingAttendanceId: null,
  filterActive: false,

  unsubStores: null,
  unsubEmployees: null,
  unsubAttendance: null
};

// ============================================
// SECTION 3: FIREBASE — Init
// ============================================
const Firebase = {
  app: null,
  auth: null,
  db: null,

  init() {
    Firebase.app = firebase.initializeApp(CONFIG.firebaseConfig);
    Firebase.auth = firebase.auth();
    Firebase.db = firebase.firestore();

    Firebase.db.enablePersistence({ synchronizeTabs: true })
      .catch(err => {
        if (err.code === 'failed-precondition') {
          console.warn('Firestore persistence: multiple tabs open, disabled in this tab');
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
  }
};

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

  formatTime(ts) {
    const d = ts?.toMillis ? new Date(ts.toMillis()) : new Date(ts);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  },

  formatDate(ts) {
    const d = ts?.toMillis ? new Date(ts.toMillis()) : new Date(ts);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  },

  getDeviceInfo() { return navigator.userAgent.substring(0, 120); },

  getStoreName(storeId) {
    const s = STATE.stores.find(x => x.id === storeId);
    return s ? s.name : '—';
  },

  getTodayCount() {
    return new Set(STATE.todayAttendance.filter(r => r.action === 'IN').map(r => r.email)).size;
  },

  msToHours(ms) {
    if (ms <= 0) return '0m';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  },

  formatTimestamp(ts) {
    if (!ts) return '—';
    return `${Utils.formatDate(ts)} ${Utils.formatTime(ts)}`;
  }
};

// ============================================
// SECTION 5: AUTH — Login / Register
// ============================================
const Auth = {
  async login() {
    if (!Firebase.auth) { Utils.showToast('Firebase not initialized. Check config.', 'error'); return; }
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    if (!email || !password) { Utils.showToast('Enter email and password', 'warning'); return; }
    Utils.showLoading();
    try {
      await Firebase.auth.signInWithEmailAndPassword(email, password);
    } catch (e) {
      const msg = e.code === 'auth/user-not-found' ? 'Account not found. Register first.' :
                  e.code === 'auth/wrong-password' ? 'Wrong password' :
                  e.code === 'auth/invalid-credential' ? 'Invalid email or password' :
                  e.code === 'auth/api-key-not-valid' ? 'Invalid Firebase API key. Check CONFIG. Re-copy from Firebase Console.' :
                  e.code === 'auth/network-request-failed' ? 'Network error. Check your internet connection.' :
                  e.message;
      Utils.showToast('Login failed: ' + msg, 'error');
    } finally { Utils.hideLoading(); }
  },

  async register() {
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;
    if (!name || !email || !password) { Utils.showToast('Fill all fields', 'warning'); return; }
    if (password.length < 6) { Utils.showToast('Password must be at least 6 characters', 'warning'); return; }
    if (password !== confirm) { Utils.showToast('Passwords do not match', 'warning'); return; }
    if (!Firebase.auth) { Utils.showToast('Firebase not initialized. Check config.', 'error'); return; }
    Utils.showLoading();
    try {
      const cred = await Firebase.auth.createUserWithEmailAndPassword(email, password);
      await cred.user.updateProfile({ displayName: name });
      Utils.showToast('Account created! Welcome.', 'success');
    } catch (e) {
      const msg = e.code === 'auth/email-already-in-use' ? 'Email already registered. Sign in.' :
                  e.code === 'auth/api-key-not-valid' ? 'Invalid Firebase API key. Check CONFIG.' :
                  e.code === 'auth/network-request-failed' ? 'Network error.' :
                  e.message;
      Utils.showToast(msg, 'error');
    } finally { Utils.hideLoading(); }
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
// SECTION 6: DB — Firestore Operations
// ============================================
const DB = {
  startListeners() {
    DB.stopListeners();

    STATE.unsubStores = Firebase.db.collection('stores')
      .onSnapshot(snapshot => {
        STATE.stores = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        if (STATE.view === 'admin') { UI.renderStores(); Admin.updateStats(); }
        if (STATE.view === 'employee') Staff.updateAssignedStore();
      }, err => {
        if (err.code === 'permission-denied') Utils.showToast('Permission denied. Check Firestore rules.', 'error');
      });

    STATE.unsubEmployees = Firebase.db.collection('employees')
      .onSnapshot(snapshot => {
        STATE.employees = snapshot.docs.map(d => ({ email: d.id, ...d.data() }));
        if (STATE.firebaseUser) {
          STATE.employeeRecord = STATE.employees.find(e => e.email?.toLowerCase() === STATE.firebaseUser.email.toLowerCase());
          STATE.isRegistered = !!STATE.employeeRecord;
        }
        if (STATE.view === 'admin') { UI.renderEmployees(); Admin.updateStats(); UI.populateStoreDropdown(); }
        if (STATE.view === 'employee') UI.renderEmployeeView();
      }, err => {
        if (err.code === 'permission-denied') Utils.showToast('Permission denied. Check Firestore rules.', 'error');
      });

    if (STATE.firebaseUser) {
      const today = Utils.getToday();
      STATE.unsubAttendance = Firebase.db.collection('attendance')
        .where('email', '==', STATE.firebaseUser.email)
        .where('date', '==', today)
        .orderBy('timestamp', 'asc')
        .onSnapshot(snapshot => {
          STATE.todayAttendance = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
          STATE.todayAttendance.sort((a, b) => (a.timestamp?.toMillis?.() || 0) - (b.timestamp?.toMillis?.() || 0));
          if (STATE.view === 'employee') {
            Staff.updateStatus();
            UI.renderEmployeeView();
          }
          if (STATE.view === 'admin') Admin.updateStats();
        }, err => {
          if (err.code === 'failed-precondition') {
            const match = err.message?.match(/https:\/\/console\.firebase\.google\.com[^\s]*/);
            const url = match ? match[0] : null;
            if (url) {
              Utils.showToast(
                '⚠️ Need index: <a href="'+url+'" target="_blank" style="color:#fff;text-decoration:underline;font-weight:700;">Click to create →</a>',
                'warning', 15000
              );
            } else {
              Utils.showToast('⚠️ Need composite index for attendance query. Check console for link.', 'warning', 6000);
            }
            console.warn('Firestore missing index. Create here:', url || 'see Firestore docs');
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
      Utils.showToast(`Store "${name}" added ✓`);
    } catch (e) { Utils.showToast('Failed: ' + e.message, 'error'); }
    finally { Utils.hideLoading(); }
  },

  async updateStore(id, name, lat, lng) {
    Utils.showLoading();
    try {
      await Firebase.db.collection('stores').doc(id).update({ name: name.trim(), lat: parseFloat(lat), lng: parseFloat(lng) });
      Utils.showToast('Store updated ✓');
    } catch (e) { Utils.showToast('Failed: ' + e.message, 'error'); }
    finally { Utils.hideLoading(); }
  },

  async deleteStore(id) {
    if (!confirm('Delete this store?')) return;
    Utils.showLoading();
    try {
      await Firebase.db.collection('stores').doc(id).delete();
      Utils.showToast('Store deleted ✓');
    } catch (e) { Utils.showToast('Failed: ' + e.message, 'error'); }
    finally { Utils.hideLoading(); }
  },

  async addEmployee(name, email, storeId) {
    if (!name || !email || !storeId) { Utils.showToast('Fill all employee fields', 'error'); return; }
    Utils.showLoading();
    try {
      await Firebase.db.collection('employees').doc(email.trim().toLowerCase()).set({
        name: name.trim(), email: email.trim().toLowerCase(), storeId, status: 'Active', createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      Utils.showToast(`Employee "${name}" added ✓`);
    } catch (e) { Utils.showToast('Failed: ' + e.message, 'error'); }
    finally { Utils.hideLoading(); }
  },

  async deleteEmployee(email) {
    if (!confirm('Delete this employee?')) return;
    Utils.showLoading();
    try {
      await Firebase.db.collection('employees').doc(email).delete();
      Utils.showToast('Employee deleted ✓');
    } catch (e) { Utils.showToast('Failed: ' + e.message, 'error'); }
    finally { Utils.hideLoading(); }
  },

  async updateEmployee(oldEmail, name, email, storeId) {
    Utils.showLoading();
    try {
      const oldDoc = Firebase.db.collection('employees').doc(oldEmail);
      const snap = await oldDoc.get();
      if (!snap.exists) { Utils.showToast('Employee not found', 'error'); return; }
      if (oldEmail !== email.toLowerCase()) {
        await oldDoc.delete();
        await Firebase.db.collection('employees').doc(email.trim().toLowerCase()).set({
          ...snap.data(), name: name.trim(), email: email.trim().toLowerCase(), storeId
        });
      } else {
        await oldDoc.update({ name: name.trim(), storeId });
      }
      Utils.showToast('Employee updated ✓');
    } catch (e) { Utils.showToast('Failed: ' + e.message, 'error'); }
    finally { Utils.hideLoading(); }
  },

  async loadAllAttendance() {
    try {
      const snap = await Firebase.db.collection('attendance')
        .orderBy('timestamp', 'desc')
        .limit(500)
        .get();
      STATE.attendance = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      STATE.filterActive = false;
      if (STATE.view === 'admin') UI.renderAdminAttendance();
    } catch { STATE.attendance = []; }
  },

  async deleteAttendance(id) {
    if (!confirm('Delete this attendance record?')) return;
    Utils.showLoading();
    try {
      await Firebase.db.collection('attendance').doc(id).delete();
      Utils.showToast('Record deleted ✓');
      DB.loadAllAttendance();
    } catch (e) { Utils.showToast('Failed: ' + e.message, 'error'); }
    finally { Utils.hideLoading(); }
  },

  async updateAttendance(id, newAction) {
    Utils.showLoading();
    try {
      await Firebase.db.collection('attendance').doc(id).update({ action: newAction });
      Utils.showToast('Record updated ✓');
      document.getElementById('edit-modal-overlay').classList.add('hidden');
      STATE.editingAttendanceId = null;
      DB.loadAllAttendance();
    } catch (e) { Utils.showToast('Failed: ' + e.message, 'error'); }
    finally { Utils.hideLoading(); }
  }
};

// ============================================
// SECTION 7: STAFF — Employee Attendance
// ============================================
const Staff = {
  updateAssignedStore() {
    STATE.assignedStore = STATE.employeeRecord
      ? STATE.stores.find(s => s.id === STATE.employeeRecord.storeId)
      : null;
  },

  updateStatus() {
    if (STATE.todayAttendance.length === 0) { STATE.currentStatus = 'none'; return; }
    const last = STATE.todayAttendance[STATE.todayAttendance.length - 1];
    STATE.currentStatus = last.action === 'IN' ? 'clocked_in' : 'clocked_out';
  },

  async checkGeofence() {
    if (!STATE.assignedStore) {
      UI.setGeoStatus('no-store', 'No store assigned'); return;
    }
    if (!navigator.geolocation) {
      UI.setGeoStatus('unavailable', 'Geolocation not supported'); return;
    }

    try {
      const perm = await navigator.permissions.query({ name: 'geolocation' });
      if (perm.state === 'denied') {
        UI.setGeoStatus('error', 'Location blocked in browser settings. Enable it for this site.');
        Staff.updatePunchButtons(); return;
      }
      if (perm.state === 'prompt') {
        UI.setGeoStatus('waiting', 'Your browser will ask for location permission shortly.');
      }
    } catch { /* permissions API not supported, proceed anyway */ }

    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true, timeout: 20000, maximumAge: 0
        });
      });

      const acc = pos.coords.accuracy;
      STATE.geoPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      STATE.geoDistance = Utils.haversine(
        STATE.geoPosition.lat, STATE.geoPosition.lng,
        STATE.assignedStore.lat, STATE.assignedStore.lng
      );
      STATE.isWithinGeofence = STATE.geoDistance <= CONFIG.GEOFENCE_RADIUS;

      if (acc > 500) {
        UI.setGeoStatus('inaccurate',
          `Low accuracy (${acc.toFixed(0)}m). Position may be wrong. Move near your store and click Refresh Location.`
        );
      } else if (STATE.isWithinGeofence) {
        UI.setGeoStatus('within', `${STATE.geoDistance.toFixed(1)}m from ${STATE.assignedStore.name}`);
      } else {
        UI.setGeoStatus('outside', `${STATE.geoDistance.toFixed(1)}m from ${STATE.assignedStore.name}`);
      }
    } catch (e) {
      if (e.code === 1) {
        UI.setGeoStatus('error', 'Location access denied. Go to browser settings → Privacy → Location and allow this site.');
      } else if (e.code === 2) {
        UI.setGeoStatus('error', 'GPS unavailable. Go outside or turn on location services.');
      } else if (e.code === 3) {
        UI.setGeoStatus('error', 'GPS timed out. Try again or move to an open area.');
      } else {
        UI.setGeoStatus('error', 'GPS error: ' + e.message);
      }
    }
    Staff.updatePunchButtons();
  },

  async refreshLocation() {
    STATE.selfieDataUrl = null;
    STATE.isWithinGeofence = false;
    UI.setGeoStatus('waiting', 'Refreshing location...');
    await Staff.checkGeofence();
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
    video.classList.add('hidden'); video.srcObject = null;
    document.getElementById('btn-open-camera').classList.remove('hidden');
    document.getElementById('btn-capture-selfie').classList.add('hidden');
    document.getElementById('btn-retake-selfie').classList.add('hidden');
  },

  captureSelfie() {
    const video = document.getElementById('selfie-video');
    const canvas = document.getElementById('selfie-canvas');
    canvas.width = 300; canvas.height = 300;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(video, 0, 0, 300, 300);
    STATE.selfieDataUrl = canvas.toDataURL('image/jpeg', 0.6);
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
      await Firebase.db.collection('attendance').add({
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        date: Utils.getToday(),
        email: STATE.firebaseUser.email,
        name: STATE.employeeRecord.name,
        action,
        photo: STATE.selfieDataUrl,
        gps: STATE.geoPosition ? `${STATE.geoPosition.lat},${STATE.geoPosition.lng}` : '',
        storeName: STATE.assignedStore ? STATE.assignedStore.name : '',
        deviceInfo: Utils.getDeviceInfo()
      });
      Utils.showToast(`${action === 'IN' ? 'Punched In' : 'Punched Out'} ✓`);
      STATE.selfieDataUrl = null;
      document.getElementById('selfie-preview-area').classList.add('hidden');
      const badge = document.getElementById('selfie-badge');
      badge.className = 'badge badge-amber'; badge.textContent = 'Required';
      Staff.closeCamera();
      Staff.updatePunchButtons();
    } catch (e) {
      Utils.showToast('Failed: ' + e.message, 'error');
    } finally { Utils.hideLoading(); }
  },

  checkOnline() {
    const bar = document.getElementById('offline-bar');
    if (!navigator.onLine) {
      bar.classList.remove('hidden');
      document.getElementById('offline-count').textContent = 'Firestore will sync when reconnected';
    } else {
      bar.classList.add('hidden');
    }
  },

  calculateHoursWorked() {
    if (STATE.todayAttendance.length === 0) return null;
    if (STATE.currentStatus === 'none') return null;
    const punches = STATE.todayAttendance;
    let totalMs = 0;
    let inTime = null;
    for (const p of punches) {
      if (p.action === 'IN') {
        inTime = p.timestamp?.toMillis ? p.timestamp.toMillis() : new Date(p.timestamp).getTime();
      } else if (p.action === 'OUT' && inTime !== null) {
        const outTime = p.timestamp?.toMillis ? p.timestamp.toMillis() : new Date(p.timestamp).getTime();
        totalMs += outTime - inTime;
        inTime = null;
      }
    }
    if (STATE.currentStatus === 'clocked_in' && inTime !== null) {
      totalMs += Date.now() - inTime;
    }
    return totalMs > 0 ? totalMs : null;
  }
};

// ============================================
// SECTION 8: ADMIN
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
    const todayIn = STATE.todayAttendance.filter(r => r.action === 'IN');
    document.getElementById('stat-today').textContent = Utils.getTodayCount();
    document.getElementById('stat-stores').textContent = STATE.stores.length;
    document.getElementById('stat-employees').textContent = STATE.employees.length;
  },

  async exportCSV() {
    await DB.loadAllAttendance();
    if (STATE.attendance.length === 0) { Utils.showToast('No records', 'info'); return; }
    const headers = ['Date', 'Time', 'Email', 'Name', 'Action', 'GPS', 'Store', 'Device'];
    const rows = STATE.attendance.map(r => [
      r.date,
      Utils.formatTime(r.timestamp),
      r.email, r.name || '', r.action,
      r.gps || '', r.storeName || '',
      (r.deviceInfo || '').substring(0, 50)
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
// SECTION 9: UI
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
      document.getElementById('emp-hours-today').style.display = 'none';
      return;
    }
    Staff.updateAssignedStore();
    document.getElementById('emp-store').textContent = STATE.assignedStore ? STATE.assignedStore.name : 'No store assigned';
    document.getElementById('emp-store').style.color = '';

    const textEl = document.getElementById('emp-status-text');
    const dotEl = document.getElementById('emp-status-dot');
    const timeEl = document.getElementById('emp-trusted-time');
    const hoursEl = document.getElementById('emp-hours-today');

    if (STATE.currentStatus === 'clocked_in') {
      const last = STATE.todayAttendance[STATE.todayAttendance.length - 1];
      textEl.textContent = `Shift Started at ${Utils.formatTime(last.timestamp)}`;
      textEl.className = 'status-text status-text-in';
      dotEl.className = 'status-dot status-dot-active';
    } else if (STATE.currentStatus === 'clocked_out') {
      const last = STATE.todayAttendance[STATE.todayAttendance.length - 1];
      textEl.textContent = `Shift Ended at ${Utils.formatTime(last.timestamp)}`;
      textEl.className = 'status-text status-text-out';
      dotEl.className = 'status-dot';
    } else {
      textEl.textContent = 'Shift Not Started';
      textEl.className = 'status-text status-text-idle';
      dotEl.className = 'status-dot';
    }
    timeEl.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    const worked = Staff.calculateHoursWorked();
    if (worked !== null) {
      hoursEl.textContent = `⏱ ${Utils.msToHours(worked)} worked today`;
      hoursEl.style.display = 'block';
    } else {
      hoursEl.style.display = 'none';
    }

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
    } else if (status === 'outside') {
      icon.textContent = '❌';
      statusEl.textContent = `✕ ${STATE.geoDistance.toFixed(0)}m away (limit ${CONFIG.GEOFENCE_RADIUS}m)`;
      statusEl.style.color = 'var(--danger)';
    } else if (status === 'inaccurate') {
      icon.textContent = '⚠️';
      statusEl.textContent = '⚠ Low accuracy location';
      statusEl.style.color = 'var(--warning)';
    } else if (status === 'waiting') {
      icon.textContent = '⏳';
      statusEl.textContent = 'Requesting GPS...';
      statusEl.style.color = 'var(--gray-500)';
    } else if (status === 'no-store') {
      icon.textContent = '⚠️'; statusEl.textContent = 'No store assigned'; statusEl.style.color = 'var(--warning)';
    } else if (status === 'error') {
      icon.textContent = '⚠️'; statusEl.textContent = 'Location unavailable'; statusEl.style.color = 'var(--warning)';
    } else {
      icon.textContent = '⏳'; statusEl.textContent = 'Checking location...'; statusEl.style.color = 'var(--gray-500)';
    }
    detailEl.textContent = detail || '';
    Staff.updatePunchButtons();
  },

  renderAttendanceHistory() {
    const container = document.getElementById('attendance-history');
    const badge = document.getElementById('today-count-badge');
    if (STATE.todayAttendance.length === 0) {
      container.innerHTML = '<p class="empty-state">No records for today</p>';
      badge.classList.add('hidden');
      return;
    }
    badge.textContent = `${STATE.todayAttendance.length} records`;
    badge.classList.remove('hidden');
    container.innerHTML = STATE.todayAttendance.map(r =>
      `<div class="flex items-center justify-between p-2" style="border-bottom:1px solid var(--gray-100);">
        <div class="flex items-center gap-2">
          <span style="font-size:1.25rem;">${r.action === 'IN' ? '✅' : '❌'}</span>
          <div>
            <span style="font-weight:600;font-size:0.875rem;">${r.action === 'IN' ? 'Punched In' : 'Punched Out'}</span>
            <span style="font-size:0.75rem;color:var(--gray-400);margin-left:0.5rem;">${Utils.formatTime(r.timestamp)}</span>
          </div>
        </div>
        <span style="font-size:0.75rem;color:var(--gray-400);">${r.storeName || ''}</span>
      </div>`
    ).join('');
  },

  renderStores() {
    const list = document.getElementById('store-list');
    if (STATE.stores.length === 0) {
      list.innerHTML = '<p class="empty-state">No stores yet. Add one above.</p>'; return;
    }
    list.innerHTML = STATE.stores.map(s =>
      `<div class="list-item">
        <div class="list-item-content">
          <div class="list-item-title">${s.name}</div>
          <div class="list-item-sub">${s.lat}, ${s.lng}</div>
        </div>
        <div class="list-item-actions">
          <button class="btn btn-sm btn-primary edit-store" data-id="${s.id}" data-name="${s.name}" data-lat="${s.lat}" data-lng="${s.lng}">Edit</button>
          <button class="btn btn-sm btn-danger delete-store" data-id="${s.id}">Del</button>
        </div>
      </div>`
    ).join('');
  },

  renderEmployees() {
    const list = document.getElementById('emp-list');
    if (STATE.employees.length === 0) {
      list.innerHTML = '<p class="empty-state">No employees yet. Add one above.</p>'; return;
    }
    list.innerHTML = STATE.employees.map(e =>
      `<div class="list-item">
        <div class="list-item-content">
          <div class="list-item-title">${e.name}</div>
          <div class="list-item-sub">${e.email} · ${Utils.getStoreName(e.storeId)}</div>
        </div>
        <div class="list-item-actions">
          <button class="btn btn-sm btn-primary edit-emp" data-email="${e.email}" data-name="${e.name}" data-store="${e.storeId}">Edit</button>
          <button class="btn btn-sm btn-danger delete-emp" data-email="${e.email}">Del</button>
        </div>
      </div>`
    ).join('');
  },

  renderAdminAttendance() {
    const body = document.getElementById('admin-attendance-body');

    // Apply client-side filter
    const from = document.getElementById('filter-date-from').value;
    const to = document.getElementById('filter-date-to').value;
    let filtered = STATE.attendance;
    if (from) filtered = filtered.filter(r => r.date >= from);
    if (to) filtered = filtered.filter(r => r.date <= to);
    STATE.filterActive = !!(from || to);

    // Update count
    const countEl = document.getElementById('filter-result-count');
    countEl.textContent = `${filtered.length} of ${STATE.attendance.length} records`;

    if (filtered.length === 0) {
      body.innerHTML = '<tr><td colspan="7" class="text-center" style="color:var(--gray-400);padding:1rem;">No records</td></tr>'; return;
    }

    body.innerHTML = filtered.map(r => {
      const hasPhoto = !!(r.photo && r.photo.length > 100);
      const actionColor = r.action === 'IN' ? 'var(--success)' : 'var(--danger)';
      return `<tr>
        <td>
          ${hasPhoto
            ? `<img class="photo-thumb view-photo" src="${r.photo}" alt="selfie" data-id="${r.id}" style="cursor:pointer;" title="View photo">`
            : '<span style="color:var(--gray-300);font-size:0.75rem;">—</span>'
          }
        </td>
        <td>${r.date}</td>
        <td>${Utils.formatTime(r.timestamp)}</td>
        <td>${r.name || r.email}</td>
        <td><span style="color:${actionColor};font-weight:600;">${r.action}</span></td>
        <td>${r.storeName || ''}</td>
        <td>
          <div class="flex gap-1" style="flex-wrap:nowrap;">
            ${hasPhoto ? `<button class="btn action-btn btn-outline view-photo-btn" data-id="${r.id}" title="View selfie">📷</button>` : ''}
            <button class="btn action-btn btn-primary edit-att-btn" data-id="${r.id}" data-action="${r.action}" data-name="${r.name || r.email}" data-date="${r.date}" data-time="${Utils.formatTime(r.timestamp)}" title="Edit">✏️</button>
            <button class="btn action-btn btn-danger delete-att-btn" data-id="${r.id}" title="Delete">🗑️</button>
          </div>
        </td>
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
      o.value = s.id; o.textContent = s.name; select.appendChild(o);
    });
    if (val) select.value = val;
  },

  showPhotoModal(id) {
    const record = STATE.attendance.find(r => r.id === id);
    if (!record || !record.photo) { Utils.showToast('No photo available', 'info'); return; }
    document.getElementById('photo-modal-img').src = record.photo;
    document.getElementById('photo-modal-info').textContent =
      `${record.name || record.email} · ${record.date} ${Utils.formatTime(record.timestamp)}`;
    document.getElementById('photo-overlay').classList.remove('hidden');
  },

  closePhotoModal() {
    document.getElementById('photo-overlay').classList.add('hidden');
    document.getElementById('photo-modal-img').src = '';
  },

  showEditModal(id) {
    const record = STATE.attendance.find(r => r.id === id);
    if (!record) { Utils.showToast('Record not found', 'error'); return; }
    STATE.editingAttendanceId = id;
    document.getElementById('edit-modal-desc').textContent =
      `${record.name || record.email} · ${record.date} ${Utils.formatTime(record.timestamp)}`;
    document.getElementById('edit-action-select').value = record.action;
    document.getElementById('edit-modal-overlay').classList.remove('hidden');
  },

  closeEditModal() {
    document.getElementById('edit-modal-overlay').classList.add('hidden');
    STATE.editingAttendanceId = null;
  },

  applyFilter() {
    if (STATE.view === 'admin') UI.renderAdminAttendance();
  },

  clearFilter() {
    document.getElementById('filter-date-from').value = '';
    document.getElementById('filter-date-to').value = '';
    STATE.filterActive = false;
    if (STATE.view === 'admin') UI.renderAdminAttendance();
  }
};

// ============================================
// SECTION 10: APP — Init
// ============================================
const App = {
  init() {
    this.bindEvents();

    setTimeout(() => document.getElementById('loading-overlay').classList.add('hidden'), 15000);

    if (CONFIG.firebaseConfig.apiKey === 'YOUR_API_KEY' || CONFIG.firebaseConfig.apiKey.length < 10) {
      document.querySelector('.login-box h2').textContent = '⚠️ Configuration Required';
      document.querySelector('.login-box > p').innerHTML =
        'Open <code>js/app.js</code> and replace the <code>firebaseConfig</code> values with your Firebase project config.<br><br>' +
        'Go to <b>Firebase Console → Project Settings → General → Your Web App</b> to copy the config object.';
      document.getElementById('login-form').innerHTML =
        '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:1rem;text-align:left;font-size:0.8125rem;">' +
        '<p style="font-weight:600;color:#991b1b;margin-bottom:0.5rem;">❌ Firebase not configured</p>' +
        '<p style="color:#b91c1c;line-height:1.5;">Your <code>firebaseConfig</code> still has placeholder values. ' +
        'You must replace them with real values from your Firebase project.</p></div>';
      return;
    }

    try {
      Firebase.init();
    } catch (e) {
      console.error('Firebase init error:', e);
      document.getElementById('login-form').innerHTML =
        '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:1rem;text-align:left;font-size:0.8125rem;">' +
        '<p style="font-weight:600;color:#991b1b;margin-bottom:0.5rem;">❌ Firebase initialization failed</p>' +
        '<p style="color:#b91c1c;line-height:1.5;">' + e.message + '</p></div>';
    }
  },

  bindEvents() {
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
      } else { DB.addStore(name, lat, lng); }
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
      } else { DB.addEmployee(name, email, storeId); }
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
      badge.className = 'badge badge-amber'; badge.textContent = 'Required';
      Staff.openCamera();
    });
    document.getElementById('btn-refresh-location').addEventListener('click', () => Staff.refreshLocation());
    document.getElementById('btn-punch-in').addEventListener('click', () => Staff.punch('IN'));
    document.getElementById('btn-punch-out').addEventListener('click', () => Staff.punch('OUT'));
    document.getElementById('btn-export-csv').addEventListener('click', () => Admin.exportCSV());

    // Photo modal
    document.getElementById('btn-close-photo').addEventListener('click', () => UI.closePhotoModal());
    document.getElementById('photo-overlay').addEventListener('click', e => {
      if (e.target === e.currentTarget) UI.closePhotoModal();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (!document.getElementById('photo-overlay').classList.contains('hidden')) UI.closePhotoModal();
        if (!document.getElementById('edit-modal-overlay').classList.contains('hidden')) UI.closeEditModal();
      }
    });

    // Edit modal
    document.getElementById('btn-cancel-edit').addEventListener('click', () => UI.closeEditModal());
    document.getElementById('edit-modal-overlay').addEventListener('click', e => {
      if (e.target === e.currentTarget) UI.closeEditModal();
    });
    document.getElementById('btn-save-edit').addEventListener('click', () => {
      const id = STATE.editingAttendanceId;
      const newAction = document.getElementById('edit-action-select').value;
      if (id && newAction) DB.updateAttendance(id, newAction);
    });

    // Filter
    document.getElementById('btn-apply-filter').addEventListener('click', () => UI.applyFilter());
    document.getElementById('btn-clear-filter').addEventListener('click', () => UI.clearFilter());

    // Delegated events for attendance table
    document.getElementById('admin-attendance-body').addEventListener('click', e => {
      const viewBtn = e.target.closest('.view-photo-btn');
      const editBtn = e.target.closest('.edit-att-btn');
      const delBtn = e.target.closest('.delete-att-btn');
      const thumb = e.target.closest('.view-photo');
      if (viewBtn || thumb) {
        const id = (viewBtn || thumb).dataset.id;
        UI.showPhotoModal(id);
      }
      if (editBtn) {
        UI.showEditModal(editBtn.dataset.id);
      }
      if (delBtn) {
        DB.deleteAttendance(delBtn.dataset.id);
      }
    });

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

    const roleBadge = document.getElementById('user-role-badge');
    if (STATE.isOwner) {
      roleBadge.textContent = 'Admin';
      roleBadge.style.background = 'rgba(251,191,36,0.2)';
      roleBadge.style.color = '#fbbf24';
    } else {
      roleBadge.textContent = 'Staff';
      roleBadge.style.background = 'rgba(255,255,255,0.15)';
      roleBadge.style.color = 'rgba(255,255,255,0.9)';
    }

    DB.startListeners();
    if (STATE.isOwner) document.getElementById('btn-switch-admin').classList.remove('hidden');
    UI.showView('employee');
    Utils.showToast(`Welcome, ${user.displayName || user.email}!`, 'success');
  },

  handleLogout() {
    DB.stopListeners();
    STATE.firebaseUser = null; STATE.isOwner = false; STATE.employeeRecord = null;
    STATE.stores = []; STATE.employees = []; STATE.attendance = []; STATE.todayAttendance = [];
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

document.addEventListener('DOMContentLoaded', () => {
  console.log('Geo Attend Pro: loaded');
  App.init();
});

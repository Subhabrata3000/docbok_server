// index.js
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const connectDB = require('./db');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const auth = require('./middleware/auth');
const { sendPushNotification } = require('./firebaseAdmin'); // Ensure this file exists
require('dotenv').config();

// Models
const User = require('./models/User');
const Appointment = require('./models/Appointment');

// Initialize App
const app = express();
const PORT = process.env.PORT || 5000;

// Connect Database
connectDB();

// Global Middleware
app.use(cors());
app.use(express.json());

// Serve Uploaded Images Publicly
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ==========================================================
// ===              MULTER CONFIGURATION                  ===
// ==========================================================
const uploadDir = 'uploads/';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

const getImageUrl = (req, filename) => {
    if (!filename) return null;
    return `${req.protocol}://${req.get('host')}/uploads/${filename}`;
};

// ==========================================================
// ===              ADMIN MIDDLEWARE                      ===
// ==========================================================
const adminAuth = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ msg: 'Access denied. Admin-only route.' });
  }
  next();
};

// ==========================================================
// ===              AUTH ROUTES                           ===
// ==========================================================

// POST /api/auth/register
app.post('/api/auth/register', upload.single('profile_image'), async (req, res) => {
  try {
    let { 
      full_name, email, password, role, 
      specialty, qualifications, experience,
      location, phoneNumber, consultationFee, availability 
    } = req.body;

    if (role === 'doctor') {
        if (typeof availability === 'string') availability = JSON.parse(availability);
        if (typeof experience === 'string') experience = parseInt(experience);
        if (typeof consultationFee === 'string') consultationFee = parseFloat(consultationFee);
    }

    if (role === 'admin') return res.status(400).json({ msg: 'Cannot register as admin.' });
    if (!email || !password || !full_name || !role) {
      return res.status(400).json({ msg: 'Please enter all required fields' });
    }
    
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ msg: 'User already exists' });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    let profileImageUrl = null;
    if (req.file) {
        profileImageUrl = getImageUrl(req, req.file.filename);
    }

    const newUserFields = {
      full_name, email, password: hashedPassword, role, phoneNumber,
      profile_image: profileImageUrl
    };

    if (role === 'doctor') {
      newUserFields.specialty = specialty;
      newUserFields.qualifications = qualifications;
      newUserFields.experience = experience;
      newUserFields.location = location;
      newUserFields.consultationFee = consultationFee;
      newUserFields.availability = JSON.stringify(availability);
    }

    user = new User(newUserFields);
    await user.save();

    const payload = { user: { id: user._id, role: user.role } };
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '30d' }, (err, token) => {
      if (err) throw err;
      res.status(201).json({ msg: 'Registered!', token, user: { id: user._id, role: user.role, full_name: user.full_name } });
    });

  } catch (err) {
    console.error("Register Error:", err.message);
    res.status(500).send('Server Error');
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ msg: 'Please enter all fields' });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ msg: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: 'Invalid credentials' });

    const payload = { user: { id: user._id, role: user.role } };
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '30d' }, (err, token) => {
      if (err) throw err;
      res.json({ token, user: { id: user._id, full_name: user.full_name, email: user.email, role: user.role } });
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// GET /api/auth/profile
app.get('/api/auth/profile', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// PUT /api/auth/profile
app.put('/api/auth/profile', auth, upload.single('profile_image'), async (req, res) => {
    try {
        const { full_name, phoneNumber, password } = req.body;
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ msg: 'User not found' });

        if (full_name) user.full_name = full_name;
        if (phoneNumber) user.phoneNumber = phoneNumber;
        
        if (password && password.trim().length > 0) {
            const salt = await bcrypt.genSalt(10);
            user.password = await bcrypt.hash(password, salt);
        }

        if (req.file) {
            user.profile_image = getImageUrl(req, req.file.filename);
        }

        await user.save();
        res.json({ success: true, user });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// ==========================================================
// ===              USER / NOTIFICATION ROUTES            ===
// ==========================================================

// POST /api/users/save-fcm-token
app.post('/api/users/save-fcm-token', auth, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ msg: 'No token provided' });
    
    await User.findByIdAndUpdate(req.user.id, { fcm_token: token });
    res.json({ msg: 'Token saved' });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// ==========================================================
// ===              DOCTOR ROUTES                         ===
// ==========================================================

app.get('/api/doctors', auth, async (req, res) => {
  try {
    const doctors = await User.find({ role: 'doctor' }).select('-password');
    res.json(doctors);
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

app.get('/api/doctors/:id/availability', auth, async (req, res) => {
  try {
    const doctor = await User.findById(req.params.id).select('availability');
    if (!doctor || !doctor.availability) return res.status(404).json({ msg: 'Not found' });
    
    let weeklySchedule = doctor.availability;
    if (typeof weeklySchedule === 'string') weeklySchedule = JSON.parse(weeklySchedule);

    const now = new Date();
    const bookedSlots = await Appointment.find({
      doctor: req.params.id,
      status: { $in: ['confirmed', 'pending'] },
      appointment_time: { $gte: now }
    }).select('appointment_time'); 

    res.json({ weeklySchedule, bookedSlots: bookedSlots.map(slot => slot.appointment_time) });
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

// ==========================================================
// ===              APPOINTMENT ROUTES                    ===
// ==========================================================

// POST /api/appointments (Book)
app.post('/api/appointments', auth, async (req, res) => {
  if (req.user.role !== 'patient') return res.status(403).json({ msg: 'Patients only' });
  
  try {
    const { doctorId, appointmentTime } = req.body; 
    if (!doctorId || !appointmentTime) return res.status(400).json({ msg: 'Missing data' });

    const exists = await Appointment.findOne({
      doctor: doctorId,
      appointment_time: appointmentTime,
      status: { $in: ['pending', 'confirmed'] } 
    });

    if (exists) return res.status(409).json({ msg: 'Slot already booked' });

    const newAppt = new Appointment({
      patient: req.user.id,
      doctor: doctorId,
      appointment_time: appointmentTime,
      status: 'pending'
    });

    await newAppt.save();
    res.status(201).json({ msg: 'Booked', appointment: newAppt });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// GET /api/appointments/my-appointments
app.get('/api/appointments/my-appointments', auth, async (req, res) => {
  try {
    const appts = await Appointment.find({ patient: req.user.id })
      .populate('doctor', 'full_name specialty location experience consultationFee profile_image')
      .sort({ appointment_time: -1 });
    res.json(appts);
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

// GET /api/appointments/doctor-schedule
app.get('/api/appointments/doctor-schedule', auth, async (req, res) => {
  if (req.user.role !== 'doctor') return res.status(403).json({ msg: 'Doctors only' });
  try {
    const appts = await Appointment.find({ doctor: req.user.id })
      .populate('patient', 'full_name profile_image')
      .sort({ appointment_time: 1 });
    res.json(appts);
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

// GET /api/appointments/requests
app.get('/api/appointments/requests', auth, async (req, res) => {
  if (req.user.role !== 'doctor') return res.status(403).json({ msg: 'Doctors only' });
  try {
    const requests = await Appointment.find({ 
      doctor: req.user.id, 
      status: 'pending' 
    })
    .populate('patient', 'full_name profile_image')
    .sort({ appointment_time: 'asc' });
    res.json(requests);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// GET /api/doctor/dashboard-stats
app.get('/api/doctor/dashboard-stats', auth, async (req, res) => {
  if (req.user.role !== 'doctor') return res.status(403).json({ msg: 'Doctors only' });
  try {
    const doctor_id = req.user.id;
    const pendingCount = await Appointment.countDocuments({
      doctor: doctor_id,
      status: 'pending',
    });
    
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    
    const todaysAppointments = await Appointment.find({
      doctor: doctor_id,
      status: 'confirmed',
      appointment_time: { $gte: startOfDay, $lt: endOfDay },
    }).populate('patient', 'full_name');

    res.json({
      pendingCount: pendingCount,
      todaysCount: todaysAppointments.length,
      todaysAppointments: todaysAppointments,
    });
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

// PUT /api/appointments/:id/status
app.put('/api/appointments/:id/status', auth, async (req, res) => {
  if (req.user.role !== 'doctor') return res.status(403).json({ msg: 'Doctors only' });
  try {
    const { status } = req.body;
    const appt = await Appointment.findOneAndUpdate(
      { _id: req.params.id, doctor: req.user.id },
      { status: status },
      { new: true }
    );
    
    if (!appt) return res.status(404).json({ msg: 'Appointment not found' });

    // Push Notifications
    try {
        const patient = await User.findById(appt.patient);
        if (patient && patient.fcm_token) {
            const doctor = await User.findById(req.user.id);
            const title = status === 'confirmed' ? 'Appointment Confirmed!' : 'Appointment Declined';
            const body = `Your appointment with Dr. ${doctor.full_name} has been ${status}.`;
            await sendPushNotification(patient.fcm_token, title, body);
        }
    } catch (e) { console.error("Push Error", e); }

    res.json({ success: true, appointment: appt });
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

// PUT /api/auth/profile
app.put('/api/auth/profile', auth, upload.single('profile_image'), async (req, res) => {
    try {
        const { 
            full_name, phoneNumber, password,
            // Doctor specific fields
            specialty, qualifications, experience, location, consultationFee, bio 
        } = req.body;

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ msg: 'User not found' });

        // 1. Basic Updates
        if (full_name) user.full_name = full_name;
        if (phoneNumber) user.phoneNumber = phoneNumber;
        
        if (password && password.trim().length > 0) {
            const salt = await bcrypt.genSalt(10);
            user.password = await bcrypt.hash(password, salt);
        }

        if (req.file) {
            user.profile_image = getImageUrl(req, req.file.filename);
        }

        // 2. Doctor-Specific Updates (Only if the user is a doctor)
        if (user.role === 'doctor') {
            if (specialty) user.specialty = specialty;
            if (qualifications) user.qualifications = qualifications;
            if (experience) user.experience = Number(experience);
            if (location) user.location = location;
            if (consultationFee) user.consultationFee = Number(consultationFee);
            if (bio) user.bio = bio; // Ensure your User model has a 'bio' field if you use this
        }

        await user.save();
        res.json({ success: true, user });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// ==========================================================
// ===              ADMIN ROUTES                          ===
// ==========================================================

app.get('/api/admin/all-users', [auth, adminAuth], async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (err) { res.status(500).send('Server Error'); }
});

app.get('/api/admin/all-appointments', [auth, adminAuth], async (req, res) => {
  try {
    const appts = await Appointment.find()
      .populate('patient', 'full_name email')
      .populate('doctor', 'full_name email')
      .sort({ appointment_time: 'desc' });
    res.json(appts);
  } catch (err) { res.status(500).send('Server Error'); }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
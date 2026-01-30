// index.js
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const multer = require('multer');
const connectDB = require('./db');
const auth = require('./middleware/auth');
const { sendPushNotification } = require('./firebaseAdmin');
const axios = require('axios');

require('dotenv').config();

// --- CLOUDINARY SETUP ---
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// ✅ CRITICAL: Ensure all Models are imported to prevent ReferenceError
const User = require('./models/User');
const Appointment = require('./models/Appointment');
const Notification = require('./models/Notification'); 

// Initialize App
const app = express();
const PORT = process.env.PORT || 5000;

// Connect Database
connectDB();

// Global Middleware
app.use(cors());
app.use(express.json());

// ==========================================================
// ===            OPTIMIZED CLOUDINARY STORAGE            ===
// ==========================================================
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'docbok_app',
        allowed_formats: ['jpg', 'png', 'jpeg'],
        transformation: [{ width: 500, height: 500, crop: 'limit' }], 
    },
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB Limit
});

// ==========================================================
// ===              HELPER / MIDDLEWARE                   ===
// ==========================================================

const adminAuth = (req, res, next) => {
    if (req.user && req.user.role === 'admin') return next();
    return res.status(403).json({ success: false, msg: 'Access denied. Admin-only route.' });
};

// Async Handler
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
        console.error(`❌ Error in ${req.originalUrl}:`, err.message);
        // Use existing status if set (e.g. 400), otherwise 500
        const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
        res.status(statusCode).json({ success: false, msg: err.message });
    });
};

// ==========================================================
// ===                  AUTH ROUTES                       ===
// ==========================================================

// POST /api/auth/register
app.post('/api/auth/register', upload.single('profile_image'), asyncHandler(async (req, res) => {
    let { 
        full_name, email, password, role, 
        specialty, qualifications, experience,
        location, phoneNumber, consultationFee, availability 
    } = req.body;

    if (!email || !password || !full_name || !role) {
        return res.status(400).json({ success: false, msg: 'Missing required fields' });
    }
    if (role === 'admin') return res.status(400).json({ success: false, msg: 'Cannot register as admin.' });

    // Check if user exists
    const existingUser = await User.exists({ email });
    if (existingUser) return res.status(400).json({ success: false, msg: 'User already exists' });

    // Handle Doctor Data Parsing
    if (role === 'doctor') {
        if (typeof availability === 'string') availability = JSON.parse(availability);
        experience = Number(experience);
        consultationFee = Number(consultationFee);
    }

    // Hash Password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Cloudinary URL
    const profileImageUrl = req.file ? req.file.path : null;

    const newUser = new User({
        full_name, email, password: hashedPassword, role, phoneNumber,
        profile_image: profileImageUrl,
        specialty, qualifications, experience, location, consultationFee, 
        availability: role === 'doctor' ? JSON.stringify(availability) : undefined
    });

    await newUser.save();

    const token = jwt.sign({ user: { id: newUser._id, role: newUser.role } }, process.env.JWT_SECRET, { expiresIn: '30d' });

    res.status(201).json({ 
        success: true, 
        token, 
        user: { id: newUser._id, role: newUser.role, full_name: newUser.full_name, profile_image: newUser.profile_image } 
    });
}));

// POST /api/auth/login
app.post('/api/auth/login', asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, msg: 'Please enter all fields' });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ success: false, msg: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ success: false, msg: 'Invalid credentials' });

    const token = jwt.sign({ user: { id: user._id, role: user.role } }, process.env.JWT_SECRET, { expiresIn: '30d' });

    res.json({ 
        success: true, 
        token, 
        user: { id: user._id, full_name: user.full_name, email: user.email, role: user.role, profile_image: user.profile_image } 
    });
}));

// GET /api/auth/profile
app.get('/api/auth/profile', auth, asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).select('-password').lean();
    res.json({ success: true, user });
}));

// PUT /api/auth/profile
app.put('/api/auth/profile', auth, upload.single('profile_image'), asyncHandler(async (req, res) => {
    let { 
        full_name, phoneNumber, password, 
        specialty, qualifications, experience, location, consultationFee, bio,
        availability 
    } = req.body;
    
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, msg: 'User not found' });

    // 1. Basic Updates
    if (full_name) user.full_name = full_name;
    if (phoneNumber) user.phoneNumber = phoneNumber;
    if (req.file) user.profile_image = req.file.path;

    if (password && password.trim().length > 0) {
        user.password = await bcrypt.hash(password, 10);
    }

    // 2. Doctor-Specific Updates
    if (user.role === 'doctor') {
        if (specialty) user.specialty = specialty;
        if (qualifications) user.qualifications = qualifications;
        if (experience) user.experience = Number(experience);
        if (location) user.location = location;
        if (consultationFee) user.consultationFee = Number(consultationFee);
        if (bio) user.bio = bio;

        if (availability) {
            user.availability = availability; 
        }
    }

    await user.save();
    
    const userResponse = user.toObject();
    delete userResponse.password;
    
    res.json({ success: true, user: userResponse });
}));

// ==========================================================
// ===          USER / NOTIFICATION ROUTES                ===
// ==========================================================

// POST Save FCM Token
app.post('/api/users/save-fcm-token', auth, asyncHandler(async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, msg: 'No token provided' });
    
    await User.findByIdAndUpdate(req.user.id, { fcm_token: token });
    res.json({ success: true, msg: 'Token saved' });
}));

// GET Notifications (Fetch list for UI)
app.get('/api/notifications', auth, asyncHandler(async (req, res) => {
    const notifications = await Notification.find({ user: req.user.id })
        .sort({ createdAt: -1 }); 
    res.json(notifications);
}));

// 1. GET Unread Count
app.get('/api/notifications/unread-count', auth, asyncHandler(async (req, res) => {
    const count = await Notification.countDocuments({ user: req.user.id, isRead: false });
    res.json({ success: true, count });
}));

// 2. PUT Mark All as Read
app.put('/api/notifications/mark-read', auth, asyncHandler(async (req, res) => {
    await Notification.updateMany(
        { user: req.user.id, isRead: false },
        { $set: { isRead: true } }
    );
    res.json({ success: true, msg: 'Notifications marked as read' });
}));

// ==========================================================
// ===                  DOCTOR ROUTES                     ===
// ==========================================================

// GET All Doctors
app.get('/api/doctors', auth, asyncHandler(async (req, res) => {
    const doctors = await User.find({ role: 'doctor' })
        .select('full_name specialty location experience consultationFee profile_image')
        .lean();
    res.json(doctors);
}));

// GET Doctor Availability
app.get('/api/doctors/:id/availability', auth, asyncHandler(async (req, res) => {
    const [doctor, bookedSlots] = await Promise.all([
        User.findById(req.params.id).select('availability').lean(),
        Appointment.find({
            doctor: req.params.id,
            status: { $in: ['confirmed', 'pending'] },
            appointment_time: { $gte: new Date() }
        }).select('appointment_time').lean()
    ]);

    if (!doctor || !doctor.availability) return res.status(404).json({ success: false, msg: 'Not found' });
    
    let weeklySchedule = doctor.availability;
    if (typeof weeklySchedule === 'string') weeklySchedule = JSON.parse(weeklySchedule);

    res.json({ 
        success: true,
        weeklySchedule, 
        bookedSlots: bookedSlots.map(slot => slot.appointment_time) 
    });
}));

// GET Dashboard Stats
app.get('/api/doctor/dashboard-stats', auth, asyncHandler(async (req, res) => {
    if (req.user.role !== 'doctor') return res.status(403).json({ success: false, msg: 'Access denied' });
    
    const doctor_id = req.user.id;
    const now = new Date();
    const startOfDay = new Date(now.setHours(0,0,0,0));
    const endOfDay = new Date(now.setHours(23,59,59,999));

    const [pendingCount, todaysAppointments] = await Promise.all([
        Appointment.countDocuments({ doctor: doctor_id, status: 'pending' }),
        Appointment.find({
            doctor: doctor_id,
            status: { $in: ['confirmed', 'pending'] },
            appointment_time: { $gte: startOfDay, $lt: endOfDay },
        })
        .populate('patient', 'full_name profile_image')
        .lean()
    ]);

    const todaysCount = todaysAppointments.filter(app => app.status === 'confirmed').length;

    res.json({ success: true, pendingCount, todaysCount, todaysAppointments });
}));

// ==========================================================
// ===              APPOINTMENT ROUTES                    ===
// ==========================================================

// POST Book Appointment
app.post('/api/appointments', auth, asyncHandler(async (req, res) => {
    if (req.user.role !== 'patient') return res.status(403).json({ success: false, msg: 'Patients only' });
    
    const { doctorId, appointmentTime } = req.body; 
    if (!doctorId || !appointmentTime) return res.status(400).json({ success: false, msg: 'Missing data' });

    const isBooked = await Appointment.exists({
        doctor: doctorId,
        appointment_time: appointmentTime,
        status: { $in: ['pending', 'confirmed'] } 
    });

    if (isBooked) return res.status(409).json({ success: false, msg: 'Slot already booked' });

    const newAppt = await Appointment.create({
        patient: req.user.id,
        doctor: doctorId,
        appointment_time: appointmentTime,
        status: 'pending'
    });

    res.status(201).json({ success: true, msg: 'Booked', appointment: newAppt });
}));

// GET My Appointments (Patient)
app.get('/api/appointments/my-appointments', auth, asyncHandler(async (req, res) => {
    const appts = await Appointment.find({ patient: req.user.id })
        .populate('doctor', 'full_name specialty location consultationFee profile_image')
        .sort({ appointment_time: -1 })
        .lean();
    res.json(appts);
}));

// GET Doctor Schedule
app.get('/api/appointments/doctor-schedule', auth, asyncHandler(async (req, res) => {
    if (req.user.role !== 'doctor') return res.status(403).json({ success: false, msg: 'Doctors only' });
    
    const appts = await Appointment.find({ doctor: req.user.id })
        .populate('patient', 'full_name profile_image')
        .sort({ appointment_time: 1 })
        .lean();
    res.json(appts);
}));

// GET Appointment Requests
app.get('/api/appointments/requests', auth, asyncHandler(async (req, res) => {
    if (req.user.role !== 'doctor') return res.status(403).json({ success: false, msg: 'Doctors only' });
    
    const requests = await Appointment.find({ doctor: req.user.id, status: 'pending' })
        .populate('patient', 'full_name profile_image')
        .sort({ appointment_time: 'asc' })
        .lean();
    res.json(requests);
}));

// PUT Update Status (Combined Master Route)
app.put('/api/appointments/:id/status', auth, asyncHandler(async (req, res) => {
    // 1. Security Check
    if (req.user.role !== 'doctor') return res.status(403).json({ success: false, msg: 'Doctors only' });
    
    const { status } = req.body;
    
    // 2. Find Appointment
    const appt = await Appointment.findOneAndUpdate(
        { _id: req.params.id, doctor: req.user.id },
        { status: status },
        { new: true }
    ).populate('patient', 'fcm_token');
    
    if (!appt) return res.status(404).json({ success: false, msg: 'Appointment not found' });

    // Fetch Doctor Name
    const doctor = await User.findById(req.user.id).select('full_name');
    const doctorName = doctor ? doctor.full_name : 'the Doctor';

    // 3. Create Database Notification
    try {
        await Notification.create({
            user: appt.patient._id, 
            title: `Appointment ${status.charAt(0).toUpperCase() + status.slice(1)}`,
            message: `Your appointment with Dr. ${doctorName} has been ${status}.`, 
            type: 'appointment',
            createdAt: new Date()
        });
    } catch (dbError) {
        console.error("DB Notification failed:", dbError.message);
    }

    // 4. Send Push Notification (✅ FIXED LOGIC)
    if (appt.patient && appt.patient.fcm_token) {
        let title = ''; 
        let body = '';

        if (status === 'confirmed') {
            //title = 'Appointment Confirmed! ✅'; 
            body = `Good news! Dr. ${doctorName} has accepted your appointment.`;
        } else if (status === 'rejected') {
            //title = 'Request Declined ❌'; 
            body = `Dr. ${doctorName} is unable to take your appointment.`;
        } else {
            title = 'Appointment Update';
            body = `Your status is now: ${status}`;
        }

        // Send Push only if title is valid
        if (title) {
            sendPushNotification(appt.patient.fcm_token, title, body)
                .catch(e => console.error("Push Notification failed:", e));
        }
    }

    res.json({ success: true, appointment: appt });
}));

// ==========================================================
// ===                  ADMIN ROUTES                      ===
// ==========================================================

// POST /api/admin/broadcast
// Desc: Send a message to ALL doctors
app.post('/api/admin/broadcast', [auth, adminAuth], asyncHandler(async (req, res) => {
    const { title, message } = req.body;

    if (!title || !message) {
        return res.status(400).json({ success: false, msg: 'Title and message are required' });
    }

    // 1. Find ALL Doctors
    const doctors = await User.find({ role: 'doctor' }).select('_id');

    if (doctors.length === 0) {
        return res.status(404).json({ success: false, msg: 'No doctors found to broadcast to.' });
    }

    // 2. Prepare Notifications Array
    const notifications = doctors.map(doc => ({
        user: doc._id,
        title: title,
        message: message,
        type: 'system', // 'system' is already in your enum
        isRead: false,
        createdAt: new Date()
    }));

    // 3. Bulk Insert (Fast!)
    await Notification.insertMany(notifications);

    // 4. (Optional) Loop to send Push Notifications here if you want
    // doctors.forEach(doc => { ... sendPushNotification ... })

    res.json({ success: true, msg: `Broadcast sent to ${doctors.length} doctors` });
}));

app.get('/api/admin/all-users', [auth, adminAuth], asyncHandler(async (req, res) => {
    const users = await User.find().select('-password').lean();
    res.json(users);
}));

app.get('/api/admin/all-appointments', [auth, adminAuth], asyncHandler(async (req, res) => {
    const appts = await Appointment.find()
        .populate('patient', 'full_name email phone gender age') 
        .populate('doctor', 'full_name email profile_image specialty consultationFee location')
        .sort({ appointment_time: 'desc' })
        .lean();
    res.json(appts);
}));

// ==========================================================
// ===         ADMIN: REMIND DOCTOR (NUDGE SYSTEM)        ===
// ==========================================================

app.post('/api/admin/remind-doctor/:id', [auth, adminAuth], asyncHandler(async (req, res) => {
    
    // 1. Find the appointment
    const appointment = await Appointment.findById(req.params.id)
        .populate('doctor', 'full_name') 
        .populate('patient', 'full_name'); 

    if (!appointment) {
        res.status(404);
        throw new Error('Appointment not found');
    }

    // ✅ CRITICAL SAFETY CHECK: Ensure Users Exist
    if (!appointment.doctor || !appointment.patient) {
        res.status(400);
        throw new Error('Associated Doctor or Patient user not found in database (Account may be deleted)');
    }

    // 2. Security Check: Only Nudge if Pending
    if (appointment.status !== 'pending') {
        res.status(400);
        throw new Error(`Cannot send reminder for a ${appointment.status} appointment.`);
    }

    // 3. Create the Notification
    await Notification.create({
        user: appointment.doctor._id,   
        type: 'system_alert',           
        title: 'Action Required: Pending Request',
        message: `Admin Reminder: Please review the appointment request from ${appointment.patient.full_name}.`,
        relatedId: appointment._id,    
        onModel: 'Appointment',
        isRead: false
    });

    res.json({ success: true, msg: 'Reminder sent to doctor successfully' });
}));


// For AI Integration
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

app.post('/api/predict', async (req, res) => {
    try {
        const { symptom } = req.body;
        // Use the variable URL instead of hardcoded localhost
        const aiResponse = await axios.post(`${AI_SERVICE_URL}/predict`, { 
            symptom: symptom 
        });
        res.json({ success: true, data: aiResponse.data });
    } catch (error) {
        console.error("AI Error:", error.message);
        res.status(500).json({ success: false });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});
// index.js
const auth = require('./middleware/auth');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const connectDB = require('./db');
const { sendPushNotification } = require('./firebaseAdmin');
require('dotenv').config();

const User = require('./models/User');
const Appointment = require('./models/Appointment');

const app = express();
const PORT = process.env.PORT || 3000;

connectDB();
app.use(express.json());

/*
 * @route   POST /api/register
 * (Unchanged)
 */
app.post('/api/register', async (req, res) => {
  try {
    const { full_name, email, password, role, specialty, bio } = req.body;

    if (!email || !password || !full_name || !role) {
      return res.status(400).json({ msg: 'Please enter all fields' });
    }
    
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ msg: 'User with this email already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    user = new User({
      full_name,
      email,
      password: hashedPassword,
      role,
      specialty: role === 'doctor' ? specialty : undefined,
      bio: role === 'doctor' ? bio : undefined
    });

    await user.save();

    res.status(201).json({
      msg: 'User registered successfully!',
      user: {
        id: user._id,
        full_name: user.full_name,
        email: user.email,
        role: user.role
      },
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});


/*
 * @route   POST /api/login
 * (Unchanged)
 */
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ msg: 'Please enter all fields' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    const payload = {
      user: {
        id: user._id,
        role: user.role,
      },
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '30d' },
      (err, token) => {
        if (err) throw err;
        res.json({
          token,
          user: {
            id: user._id,
            full_name: user.full_name,
            email: user.email,
            role: user.role,
          },
        });
      }
    );

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

/*
 * @route   GET /api/doctors
 * (Unchanged)
 */
app.get('/api/doctors', auth, async (req, res) => {
  try {
    const doctors = await User.find({ role: 'doctor' }).select('-password');
    res.json(doctors);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});


/*
 * @route   POST /api/appointments/book
 * (Unchanged)
 */
app.post('/api/appointments/book', auth, async (req, res) => {
  if (req.user.role !== 'patient') {
    return res.status(403).json({ msg: 'Access denied: Only patients can book appointments.' });
  }

  try {
    const { doctor_id, appointment_time } = req.body;
    const patient_id = req.user.id;

    if (!doctor_id || !appointment_time) {
      return res.status(400).json({ msg: 'Please provide a doctor ID and appointment time.' });
    }

    const newAppointment = new Appointment({
      patient: patient_id,
      doctor: doctor_id,
      appointment_time: appointment_time,
    });

    await newAppointment.save();

    res.status(201).json({
      msg: 'Appointment request sent successfully!',
      appointment: newAppointment,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});


/*
 * @route   GET /api/my-appointments
 * (Unchanged)
 */
app.get('/api/my-appointments', auth, async (req, res) => {
  if (req.user.role !== 'patient') {
    return res.status(403).json({ msg: 'Access denied.' });
  }

  try {
    const appointments = await Appointment.find({ patient: req.user.id })
      .populate('doctor', 'full_name specialty')
      .sort({ appointment_time: -1 });

    res.json(appointments);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

/*
 * @route   POST /api/users/save-fcm-token
 * (Unchanged)
 */
app.post('/api/users/save-fcm-token', auth, async (req, res) => {
  const { token } = req.body;
  const user_id = req.user.id;

  if (!token) {
    return res.status(400).json({ msg: 'No token provided.' });
  }

  try {
    await User.findByIdAndUpdate(user_id, { fcm_token: token });
    res.json({ msg: 'Token saved successfully.' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});


/*
 * @route   GET /api/appointments/requests
 * (Unchanged)
 */
app.get('/api/appointments/requests', auth, async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ msg: 'Access denied: Doctors only.' });
  }

  try {
    const requests = await Appointment.find({ 
      doctor: req.user.id, 
      status: 'pending' 
    })
    .populate('patient', 'full_name')
    .sort({ appointment_time: 'asc' });

    res.json(requests);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});


/*
 * @route   GET /api/appointments/schedule
 * (Unchanged)
 */
app.get('/api/appointments/schedule', auth, async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ msg: 'Access denied: Doctors only.' });
  }

  try {
    const doctor_id = req.user.id;
    
    const schedule = await Appointment.find({ 
      doctor: doctor_id, 
      status: { $ne: 'pending' } // $ne means 'not equal'
    })
    .populate('patient', 'full_name')
    .sort({ appointment_time: 'desc' });

    res.json(schedule);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});


// ==========================================================
// ===         NEW DOCTOR DASHBOARD ENDPOINT ADDED        ===
// ==========================================================
/*
 * @route   GET /api/doctor/dashboard-stats
 * @desc    Get dashboard stats for the logged-in doctor
 * @access  Private (Doctor-only)
 */
app.get('/api/doctor/dashboard-stats', auth, async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ msg: 'Access denied: Doctors only.' });
  }

  try {
    const doctor_id = req.user.id;

    // --- 1. Get Pending Request Count ---
    const pendingCount = await Appointment.countDocuments({
      doctor: doctor_id,
      status: 'pending',
    });

    // --- 2. Get Today's Confirmed Appointments ---
    
    // Set date boundaries for "today"
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const todaysAppointments = await Appointment.find({
      doctor: doctor_id,
      status: 'confirmed',
      appointment_time: {
        $gte: startOfDay, // Greater than or equal to start of today
        $lt: endOfDay,     // Less than end of today
      },
    })
    .populate('patient', 'full_name')
    .sort({ appointment_time: 'asc' }); // Sort by time

    // 3. Send all data in one response
    res.json({
      pendingCount: pendingCount,
      todaysCount: todaysAppointments.length,
      todaysAppointments: todaysAppointments,
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});
// ==========================================================


/*
 * @route   PUT /api/appointments/accept/:id
 * (Unchanged)
 */
app.put('/api/appointments/accept/:id', auth, async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ msg: 'Access denied: Doctors only.' });
  }

  try {
    const appointment_id = req.params.id;
    const doctor_id = req.user.id;

    const confirmedAppointment = await Appointment.findOneAndUpdate(
      { _id: appointment_id, doctor: doctor_id, status: 'pending' },
      { status: 'confirmed' },
      { new: true }
    );

    if (!confirmedAppointment) {
      return res.status(404).json({ msg: 'Appointment not found or you do not have permission.' });
    }

    try {
      const patient = await User.findById(confirmedAppointment.patient);
      const patientToken = patient?.fcm_token;
      
      if (patientToken) {
        const doctor = await User.findById(doctor_id);
        const doctorName = doctor.full_name;
        const apptTime = new Date(confirmedAppointment.appointment_time).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

        await sendPushNotification(
          patientToken,
          'Appointment Confirmed!',
          `Your appointment with ${doctorName} on ${apptTime} is confirmed.`
        );
      } else {
        console.log('Patient has no FCM token. Skipping notification.');
      }
    } catch (notifyError) {
      console.error('Failed to send push notification:', notifyError);
    }
    
    res.json({
      msg: 'Appointment accepted',
      appointment: confirmedAppointment,
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});


/*
 * @route   PUT /api/appointments/reject/:id
 * (Unchanged) - Corrected the 4a03 typo to 403
 */
app.put('/api/appointments/reject/:id', auth, async (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ msg: 'Access denied: Doctors only.' }); // Typo fixed
  }

  try {
    const appointment_id = req.params.id;
    const doctor_id = req.user.id;

    const rejectedAppointment = await Appointment.findOneAndUpdate(
      { _id: appointment_id, doctor: doctor_id, status: 'pending' },
      { status: 'rejected' },
      { new: true }
    );

    if (!rejectedAppointment) {
      return res.status(404).json({ msg: 'Appointment not found or you do not have permission.' });
    }
    
    try {
      const patient = await User.findById(rejectedAppointment.patient);
      const patientToken = patient?.fcm_token;

      if (patientToken) {
        const doctor = await User.findById(doctor_id);
        const doctorName = doctor.full_name;

        await sendPushNotification(
          patientToken,
          'Appointment Update',
          `Your appointment request with ${doctorName} for ${new Date(rejectedAppointment.appointment_time).toLocaleDateString()} was declined.`
        );
      }
    } catch (notifyError) {
      console.error('Failed to send rejection notification:', notifyError);
    }

    res.json({
      msg: 'Appointment rejected',
      appointment: rejectedAppointment,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// === Start the server ===
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
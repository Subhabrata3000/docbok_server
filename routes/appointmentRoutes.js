// routes/appointmentRoutes.js
const express = require('express');
const router = express.Router();
const appointmentController = require('../controllers/appointmentController');
const auth = require('../middleware/auth');

router.post('/', auth, appointmentController.bookAppointment);
router.get('/my-appointments', auth, appointmentController.getMyAppointments);
router.get('/doctor-schedule', auth, appointmentController.getDoctorSchedule);
router.put('/:id/status', auth, appointmentController.updateStatus);

module.exports = router;
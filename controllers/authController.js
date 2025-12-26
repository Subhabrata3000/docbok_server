// controllers/authController.js
const User = require('../models/User'); // Assuming your model is here
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Helper to get full Image URL
const getImageUrl = (req, filename) => {
    if (!filename) return null;
    return `${req.protocol}://${req.get('host')}/uploads/${filename}`;
};

exports.register = async (req, res) => {
    try {
        // 1. Extract text fields
        let { full_name, email, password, role, specialty, qualifications, experience, location, phoneNumber, consultationFee, availability } = req.body;

        // 2. Check if user exists
        let user = await User.findOne({ email });
        if (user) return res.status(400).json({ message: 'User already exists' });

        // 3. Hash Password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 4. Handle Multipart Data Parsing (Crucial for Doctor Registration)
        // Multipart forms send numbers/arrays as Strings. We must parse them back.
        if (role === 'doctor') {
            if (typeof availability === 'string') availability = JSON.parse(availability);
            if (typeof experience === 'string') experience = parseInt(experience);
            if (typeof consultationFee === 'string') consultationFee = parseFloat(consultationFee);
        }

        // 5. Handle Image File
        let profile_image_url = null;
        if (req.file) {
            profile_image_url = getImageUrl(req, req.file.filename);
        }

        // 6. Create User
        user = new User({
            full_name,
            email,
            password: hashedPassword,
            role,
            phoneNumber,
            // Doctor specific fields
            specialty: role === 'doctor' ? specialty : undefined,
            qualifications: role === 'doctor' ? qualifications : undefined,
            experience: role === 'doctor' ? experience : undefined,
            location: role === 'doctor' ? location : undefined,
            consultationFee: role === 'doctor' ? consultationFee : undefined,
            availability: role === 'doctor' ? availability : undefined,
            profile_image: profile_image_url,
        });

        await user.save();

        // 7. Generate Token
        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });

        res.status(201).json({ 
            token, 
            user: { 
                id: user._id, 
                full_name: user.full_name, 
                email: user.email, 
                role: user.role,
                profile_image: user.profile_image
            } 
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

// --- NEW PROFILE METHODS ---

exports.getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password'); // Exclude password
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const { full_name, phoneNumber, password } = req.body;
        const user = await User.findById(req.user.id);

        if (!user) return res.status(404).json({ message: 'User not found' });

        // Update Fields
        if (full_name) user.full_name = full_name;
        if (phoneNumber) user.phoneNumber = phoneNumber;
        
        // Update Password (if provided)
        if (password && password.trim().length > 0) {
            const salt = await bcrypt.genSalt(10);
            user.password = await bcrypt.hash(password, salt);
        }

        // Update Image (if provided)
        if (req.file) {
            user.profile_image = getImageUrl(req, req.file.filename);
        }

        await user.save();

        res.json({ success: true, user });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
};
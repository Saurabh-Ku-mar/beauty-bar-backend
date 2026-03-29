const express = require('express');
const router = express.Router();
const Service = require('../models/Service');

// ✅ GET all services
router.get('/', async (req, res) => {
    try {
        const services = await Service.find();
        res.json(services);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ✅ GET single service by ID
router.get('/:id', async (req, res) => {
    try {
        const service = await Service.findById(req.params.id);
        if (!service) {
            return res.status(404).json({ message: "Service not found" });
        }
        res.json(service);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ✅ CREATE new service (Admin)
router.post('/', async (req, res) => {
    try {
        const newService = new Service({
            name: req.body.name,
            price: req.body.price,
            duration: req.body.duration,
            description: req.body.description
        });

        const savedService = await newService.save();
        res.status(201).json(savedService);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// ✅ UPDATE service (Admin)
router.put('/:id', async (req, res) => {
    try {
        const updatedService = await Service.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );

        res.json(updatedService);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// ✅ DELETE service (Admin)
router.delete('/:id', async (req, res) => {
    try {
        await Service.findByIdAndDelete(req.params.id);
        res.json({ message: "Service deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;

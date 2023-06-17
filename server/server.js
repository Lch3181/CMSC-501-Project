require('dotenv').config();
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcrypt');
const session = require('express-session');
const path = require('path');
const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

app.use(express.json());
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}));

// MongoDB connection
let usersCollection, workoutsCollection, goalsCollection;

MongoClient.connect(process.env.DB_CONNECTION_STRING, {})
    .then(client => {
        console.log('Connected to Database');
        const db = client.db('WorkoutTrackerDB');
        usersCollection = db.collection('Users');
        workoutsCollection = db.collection('Workouts');
        goalsCollection = db.collection('Goals');

        // Index Page
        app.get('/', (req, res) => {
            res.render('index');
        });

        // Registration Page
        app.get('/register', (req, res) => {
            res.render('register');
        });

        app.post('/register', async (req, res) => {
            const { username, password } = req.body;
            try {
                // Check if the username already exists
                const userExists = await usersCollection.findOne({ username });
                if (userExists) {
                    // If the username exists, send an appropriate response
                    res.status(400).send('Username already exists');
                } else {
                    // If the username doesn't exist, continue with the registration process
                    const hashedPassword = await bcrypt.hash(password, 10);
                    const user = {
                        username,
                        password: hashedPassword,
                    };
                    const result = await usersCollection.insertOne(user);
                    req.session.userId = result.insertedId;
                    res.redirect('/dashboard');
                }
            } catch (error) {
                console.error(error);
                res.status(500).send('Server error');
            }
        });
        
        // Login Page
        app.get('/login', (req, res) => {
            res.render('login');
        });

        app.post('/login', async (req, res) => {
            try {
                const user = await usersCollection.findOne({username: req.body.username});
                if (user && await bcrypt.compare(req.body.password, user.password)) {
                    req.session.userId = user._id;
                    res.redirect('/dashboard');
                } else {
                    res.send('Invalid username or password.');
                }
            } catch (error) {
                console.error(error);
                res.status(500).send('Server error');
            }
        });

        app.get('/logout', (req, res) => {
            req.session.destroy(error => {
                if (error) {
                    console.error(error);
                    res.status(500).send('Server error');
                } else {
                    res.redirect('/');
                }
            });
        });

        // User Dashboard
        app.get('/dashboard', (req, res) => {
            if (!req.session.userId) {
                res.redirect('/login');
                return;
            }

            Promise.all([
                usersCollection.findOne({ _id: new ObjectId(req.session.userId) }),
                workoutsCollection.find({ userId: req.session.userId }).toArray(),
                goalsCollection.find({ userId: req.session.userId }).toArray()
            ]).then(([user, workouts, goals]) => {
                res.render('dashboard', { user, workouts, goals });
            }).catch(error => {
                console.error(error);
                res.status(500).send('Server error');
            });
        });

        // achieve goal
        app.post('/goals/achieved', async (req, res) => {
            if (!req.session.userId) {
                res.redirect('/login');
                return;
            }
        
            try {
                const goalId = req.body.goalId;
                await goalsCollection.updateOne(
                    { _id: new ObjectId(goalId), userId: req.session.userId },
                    { $set: { achieved: true } }
                );
                res.redirect('/dashboard');
            } catch (error) {
                console.error(error);
                res.status(500).send('Server error');
            }
        });        

        // Log Workout Page
        app.get('/logworkout', (req, res) => {
            if (!req.session.userId) {
                res.redirect('/login');
                return;
            }

            res.render('logworkout');
        });

        // Log Workout
        app.post('/logworkout', (req, res) => {
            if (!req.session.userId) {
                res.redirect('/login');
                return;
            }

            const workout = {
                userId: req.session.userId,
                type: req.body.workoutType,
                duration: Number(req.body.duration),
                intensity: req.body.intensity,
                distance: Number(req.body.distance),
                date: new Date()
            };

            workoutsCollection.insertOne(workout)
                .then(result => {
                    res.redirect('/dashboard');
                }).catch(error => {
                    console.error(error);
                    res.status(500).send('Server error');
                });
        });

        // Set Goal Page
        app.get('/setgoal', (req, res) => {
            if (!req.session.userId) {
                res.redirect('/login');
                return;
            }

            res.render('setgoal');
        });

        // Set Goal
        app.post('/setgoal', (req, res) => {
            if (!req.session.userId) {
                res.redirect('/login');
                return;
            }

            const goal = {
                userId: req.session.userId,
                description: req.body.goalDescription,
                date: new Date(),
                achieved: false
            };

            goalsCollection.insertOne(goal)
                .then(result => {
                    res.redirect('/dashboard');
                }).catch(error => {
                    console.error(error);
                    res.status(500).send('Server error');
                });
        });
        
        // Progress Report Page
        app.get('/progressreport', async (req, res) => {
            if (!req.session.userId) {
                res.redirect('/login');
                return;
            }

            try {
                const workouts = await workoutsCollection.find({userId: req.session.userId}).sort({date: 1}).toArray();
                const goals = await goalsCollection.find({userId: req.session.userId}).sort({date: 1}).toArray();

                const dates = workouts.map(workout => workout.date.toISOString().slice(0,10)); // 'YYYY-MM-DD'
                const durations = workouts.map(workout => workout.duration);
                const intensities = workouts.map(workout => workout.intensity);

                res.render('progressreport', {
                    workouts,
                    goals,
                    dates,
                    durations,
                    intensities
                });
            } catch (error) {
                console.error(error);
                res.status(500).send('Server error');
            }
        });
        
        app.listen(3000, function() {
            console.log('Server is running on http://localhost:3000');
        });
    })
    .catch(error => console.error(error));

import dotenv from "dotenv";
dotenv.config();

import { fileURLToPath } from "url";
import path from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import express from "express";
import pkg from 'body-parser';
const { urlencoded } = pkg;
import ejs from "ejs";
import mongoose from "mongoose";
import passport from "passport";
import session from "express-session";
import passportLocalMongoose from "passport-local-mongoose";
import { Strategy } from "passport-google-oauth20";
import facebook from "passport-facebook";
import alert from 'alert';
import cookieParser from "cookie-parser";
import { get } from "http";

const app = express();

app.set("view engine", "ejs");
app.use(urlencoded({ extended: true }));
app.use(express.static(__dirname + "/public/"));
app.use(cookieParser());

app.use(session({
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

mongoose.connect("mongodb://localhost:27017/pgHUB", { useCreateIndex: true, useUnifiedTopology: true, useNewUrlParser: true });

const userSchema = new mongoose.Schema({
    username: String,
    password: String,
    location: String,
    totalRatings: Number,
    age: Number,
    googleId: String,
    facebookId: String,
});

var message = "";

userSchema.plugin(passportLocalMongoose);

const User = new mongoose.model("User", userSchema);

passport.use(User.createStrategy());

passport.serializeUser(function (user, done) {
    done(null, user.id);
});

passport.deserializeUser(function (id, done) {
    User.findById(id, function (err, user) {
        done(err, user);
    });
});

// ------------------- Google Strategy --------------------
passport.use(new Strategy({
    clientID: process.env.GCLIENT_ID,
    clientSecret: process.env.GCLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/pgHUB",
    userProfileURL: "https://www.googleapis.com/oauth2/v2/userinfo"
},
    function (accessToken, refreshToken, profile, done) {
        console.log(profile);
        const data = profile._json;
        User.findOne({ "googleId": data.id }, function (err, user) {
            if (err) return done(err);

            if (!user) {
                user = new User({
                    username: data.email,
                    location: "No Idea",
                    totalRatings: 0,
                    age: 0,
                    googleId: data.id
                });
                user.save(function (err) {
                    if (err) console.log(err);
                    return done(err, user);
                });
            } else {
                return done(err, user);
            }
        });
    }
));

// ----------------- Facebook Strategy --------------------
passport.use(new facebook.Strategy({
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: "http://localhost:3000/auth/facebook/pgHUB"
},
    function (accessToken, refreshToken, profile, done) {
        User.findOne({ "facebookId": profile.id }, function (err, user) {
            if (err) return done(err);

            if (!user) {
                user = new User({
                    username: profile.displayName.split(" ")[0],
                    location: "No Idea",
                    totalRatings: 0,
                    age: 0,
                    facebookId: profile.id
                });
                user.save(function (err) {
                    if (err) console.log(err);
                    return done(err, user);
                })
            } else {
                return done(err, user);
            }
        });
    }
));

// -------------------- Routings ----------------------------

app.get("/", function (req, res) {
    res.redirect("/login");
});

// -------------- Google oAuth Routings ------------------------------
app.get("/auth/google",
    passport.authenticate("google", { scope: ["profile", "email"] })
);

app.get("/auth/google/pgHUB",
    passport.authenticate("google", { failureRedirect: "/login" }),
    function (req, res) {
        res.redirect("/user/" + req.user.username);
    }
);
// -------------------------------------------------------------------

// ------------------- Facebook oAuth Routings -----------------------
app.get('/auth/facebook',
    passport.authenticate('facebook', { scope: ["email"] }),
    function (req, res) { }
);

app.get('/auth/facebook/pgHUB',
    passport.authenticate('facebook', { failureRedirect: '/login' }),
    function (req, res) {
        // Successful authentication, redirect home.
        res.redirect('/');
    });


app.get("/login", function (req, res) {
    if (req.isAuthenticated()) {
        res.redirect("/user/" + req.user.username);
    } else {
        if (message != "") {
            alert(message);
        }
        res.render("login", { message: message, meUser: -1 });
        message = "";
    }
});

app.post("/login", function (req, res) {
    const newUser = new User({
        username: req.body.username,
        password: req.body.password
    });
    req.login(newUser, function (err) {
        if (err) {
            console.log(err);
            message = err.toString().split(":")[1].trim();
            res.redirect("/login");
        } else {
            passport.authenticate("local")(req, res, function () {
                res.redirect("/user/" + newUser.username);
            });
        }
    });
});

app.get("/register", function (req, res) {
    if (req.isAuthenticated()) {
        res.redirect("/user/" + req.user.username);
    } else {
        res.render("register", { message: message, meUser: -1 });
        message = "";
    }
});

app.post("/register", function (req, res) {
    User.register({ username: req.body.username }, req.body.password, function (err, user) {
        if (err) {
            console.log(err);
            message = err.toString().split(":")[1].trim();
            res.redirect("/login");
        } else {
            const lati = req.cookies["latitude"];
            const longi = req.cookies["longitude"];

            const url = "http://api.positionstack.com/v1/reverse?access_key=" + process.env.POSAPI_KEY + "&query=" + lati + "," + longi + "&limit=1";
            get(url, function (response) {
                response.on("data", function (data) {
                    const addressData = JSON.parse(data);
                    var locality = addressData.data[0].locality;
                    passport.authenticate("local")(req, res, function () {
                        // res.send("Succesfully logged in");
                        console.log(locality);
                        User.findOneAndUpdate({ username: user.username }, { location: locality, totalRatings: 0, age: 0 }, function (err) {
                            if (err) console.log(err);
                        });
                        res.redirect("/user/" + req.user.username);
                    });
                });
            });
        }
    });
});

app.get("/user/:name", function (req, res) {
    const userName = req.params.name;
    console.log(userName);
    var meUser;
    User.findOne({ username: userName }, function (err, user) {
        console.log(user);
        if (err) {
            console.log(err);
        } else {
            if (user != null) {
                if (req.isAuthenticated()) meUser = req.user.username;
                else meUser = -1;
                res.render("user", { user: user, meUser: meUser });
            } else {
                message = "Couldn't find user";
                res.redirect("/login");
                message = "";
            }
        }
    });
});

app.get("/search", function (req, res) {
    if (req.isAuthenticated()) {
        res.render("search", { meUser: req.user.username });
    } else {
        res.render("search", { meUser: -1 });
    }
});

app.get("/logout", function (req, res) {
    req.logout();
    res.redirect("/login");
});

app.listen(3000, function () {
    console.log("Server started at port 3000");
});
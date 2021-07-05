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

const app = express();

app.set("view engine", "ejs");
app.use(urlencoded({ extended: true }));
app.use(express.static(__dirname + "/public/"));

console.log(process.env.SECRET);
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
    googleId: String
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


app.get("/login", function (req, res) {
    res.render("login", { message: message });
    message = "";
});

app.post("/login", function (req, res) {
    const newUser = new User({
        username: req.body.username,
        password: req.body.password
    });
    console.log(newUser);
    req.login(newUser, function (err) {
        if (err) {
            console.log(err);
            message = err.toString().split(":")[1].trim();
            console.log(message);
            res.redirect("/login");
        } else {
            passport.authenticate("local")(req, res, function () {
                res.redirect("/user/" + newUser.username);
            });
        }
    });
});

app.post("/register", function (req, res) {
    User.register({ username: req.body.username }, req.body.password, function (err, user) {
        if (err) {
            console.log(err);
            message = err.toString().split(":")[1].trim();
            console.log(message);
            res.redirect("/login");
        } else {
            passport.authenticate("local")(req, res, function () {
                // res.send("Succesfully logged in");
                res.redirect("/user/" + req.user.name);
            });
        }
    });

});

app.get("/user/:name", function (req, res) {
    const userName = req.params.name;
    User.findOne({ username: userName }, function (err, user) {
        if (err) {
            console.log(err);
        } else {
            if (user){
                console.log(user);
                res.render("user", { user: user });
            } else {
                message = "Couldn't find user";
                res.redirect("/login");
            } 
        }
    });
});


app.listen(3000, function () {
    console.log("Server started at port 3000");
});
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
import { stringify } from "querystring";

const app = express();

app.set('view engine', 'ejs');
app.use(urlencoded({ extended: true }));
app.set('views', path.join(__dirname, '/views'));
app.use(express.static(path.join(__dirname, "public")));
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
    latitude: Number,
    longitude: Number,
    commentIds: [String],
    admin: Boolean
});

const pgSchema = new mongoose.Schema({
    name: String,
    email: String,
    latitude: Number,
    longitude: Number,
    city: String,
    price: Number,
    nonveg: Boolean,
    AC: Boolean,
    accepted: Boolean,
    totalRatings: Number,
    photos: String,
    commentIds: [String],
    userId: String,
    avgRating: Number
});

const commentSchema = new mongoose.Schema({
    content: String,
    score: Number,
    userId: String,
    pgId: String,
    username: String,
    pgName: String
});

var message = "";

userSchema.plugin(passportLocalMongoose);

const User = new mongoose.model("User", userSchema);
const Pg = new mongoose.model("Pg", pgSchema);
const Comment = new mongoose.model("Comment", commentSchema);

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

// ------------------------------------------------------------------


// ------------------- LOGIN ----------------------------------------
app.get("/login", function (req, res) {
    if (req.isAuthenticated()) {
        res.redirect("/user/" + req.user.username);
    } else {
        if (message != "") {
            alert(message);
        }
        res.render("login.ejs", { message: message, meUser: -1 });
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
// ----------------------------------------------------------------

// -------------------------- REGISTER ----------------------------
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
                    var locality;
                    if (addressData.error.code == "validation_error") {
                        locality = "No Idea";
                    } else {
                        locality = addressData.data[0].county;
                        if (locality == null || locality == undefined) {
                            locality = addressData.data[0].country;
                        }
                    }
                    passport.authenticate("local")(req, res, function () {
                        // res.send("Succesfully logged in");
                        console.log(locality);
                        User.findOneAndUpdate({ username: user.username }, { location: locality, totalRatings: 0, age: 0, longitude: longi, latitude: lati }, function (err) {
                            if (err) console.log(err);
                            res.redirect("/user/" + req.user.username);
                        });
                    });
                });
            });
        }
    });
});
// -------------------------------------------------------------------------------------------------------------

// --------------------------------------- USERS -------------------------------------------------
app.get("/user/:name", function (req, res) {
    const userName = req.params.name;
    var meUser = -1;
    // console.log(userName);
    User.findOne({ username: userName }, function (err, user) {
        // console.log(user);
        if (err) {
            console.log(err);
        } else {
            if (user != null) {
                if (req.isAuthenticated()) {
                    meUser = req.user;
                    var comments = new Array();
                    for (let index = 0; index < user.commentIds.length; index++) {
                        const comId = user.commentIds[index];
                        Comment.findById(comId, function (err, comme) {
                            // console.log(comme);
                            comments.push(comme);
                            if (index == user.commentIds.length - 1) {
                                // console.log(comments);
                                res.render("user", { user: user, meUser: meUser, comments: comments });
                            }
                        });
                    }
                    if (user.commentIds.length == 0) {
                        res.render("user", { user: user, meUser: meUser, comments: comments });
                    }
                }
            } else {
                message = "Couldn't find user";
                res.redirect("/login");
                message = "";
            }
        }
    });
});
// ------------------------------------------------------------------------------------------------


// -------------------------------------- SEARCH/FILTER -----------------------------------------
app.get("/search", function (req, res) {
    if (req.isAuthenticated()) {
        Pg.find({ accepted: true }, function (err, pgs) {
            var cities = new Set();
            pgs.forEach(function (pg) {
                cities.add(pg.city);
            });
            console.log(cities);
            res.render("search", { meUser: req.user, pgs: pgs, cities: cities, dikhaneKa: 0 });
        });

    } else {
        res.redirect("/login");
    }
});

app.post("/search", function (req, res) {
    Pg.find({}, function (err, pgs) {
        var citiess = new Set();
        pgs.forEach(function (pg) {
            citiess.add(pg.city);
        });
        const { cities } = req.body;
        const { rating } = req.body;
        const { price } = req.body;
        const ratings = new Array();
        if (price != undefined) {
            const p1 = Number(price.split('-')[0]);
            const p2 = Number(price.split('-')[1]);
            console.log(p1, p2);
            if (rating != undefined) {
                for (let i = 0; i < rating.length; i++) {
                    ratings.push(Number(rating[i]));
                }

                if (cities != undefined && cities.length != 0) {
                    Pg.find({ city: cities, avgRating: ratings, price: { $gte: p1, $lte: p2 }, accepted: true }, function (err, pgs) {
                        res.render("search", { meUser: req.user, pgs: pgs, cities: citiess, dikhaneKa: -1 });
                    });
                } else {
                    Pg.find({ avgRating: ratings, price: { $gte: p1, $lte: p2 }, accepted: true }, function (err, pgs) {
                        res.render("search", { meUser: req.user, pgs: pgs, cities: citiess, dikhaneKa: -1 });
                    });
                }
            } else {
                if (cities != undefined && cities.length != 0) {
                    Pg.find({ city: cities, price: { $gte: p1, $lte: p2 }, accepted: true }, function (err, pgs) {
                        // console.log(pgs);
                        res.render("search", { meUser: req.user, pgs: pgs, cities: citiess, dikhaneKa: -1 });
                    });
                } else {
                    Pg.find({ price: { $gte: p1, $lte: p2 }, accepted: true }, function (err, pgs) {
                        res.render("search", { meUser: req.user, pgs: pgs, cities: citiess, dikhaneKa: -1 });
                    });
                }
            }
        } else {
            if (rating != undefined) {
                for (let i = 0; i < rating.length; i++) {
                    ratings.push(Number(rating[i]));
                }

                if (cities != undefined && cities.length != 0) {
                    Pg.find({ city: cities, avgRating: ratings, accepted: true }, function (err, pgs) {
                        res.render("search", { meUser: req.user, pgs: pgs, cities: citiess, dikhaneKa: -1 });
                    });
                } else {
                    Pg.find({ avgRating: ratings, accepted: true }, function (err, pgs) {
                        res.render("search", { meUser: req.user, pgs: pgs, cities: citiess, dikhaneKa: -1 });
                    });
                }
            } else {
                if (cities != undefined && cities.length != 0) {
                    Pg.find({ city: cities, accepted: true }, function (err, pgs) {
                        // console.log(pgs);
                        res.render("search", { meUser: req.user, pgs: pgs, cities: citiess, dikhaneKa: -1 });
                    });
                } else {
                    Pg.find({ accepted: true }, function (err, pgs) {
                        res.render("search", { meUser: req.user, pgs: pgs, cities: citiess, dikhaneKa: -1 });
                    });
                }
            }
        }
    });
});

// ---------------------------------------------------------------------------------------------

// ------------------------------------ Application for NEwPG ------------------------------------
app.get("/newpg", function (req, res) {
    if (req.isAuthenticated()) {
        res.render("newpg", { meUser: req.user });
    } else {
        res.redirect("/login");
    }
});

app.post("/newpg", function (req, res) {
    if (req.isAuthenticated()) {
        var nonveg = false;
        var ac = false;
        if (req.body.nonveg == "on") nonveg = true;
        if (req.body.ac == "on") ac = true;
        const newPG = new Pg({
            name: req.body.name.trim(),
            email: req.body.email.trim(),
            latitude: req.body.latitude.trim(),
            longitude: req.body.longitude.trim(),
            city: req.body.city.trim(),
            price: req.body.price.trim(),
            nonveg: nonveg,
            AC: ac,
            photos: req.body.photos.trim(),
            totalRatings: 0,
            accepted: false,
            photos: req.body.photos.trim(),
            userId: req.user._id
        });

        newPG.save(function (err) {
            if (err) console.log(err);
            else {
                alert("Your request has been sent to the admin.")
                console.log(newPG);
                res.redirect("/search");
            }
        });
    } else {
        res.redirect("/login");
    }
});
// -----------------------------------------------------------------------------------------------------------

// ---------------------------------------- Specific PG ------------------------------------------------
app.get("/pg/:pgName", function (req, res) {
    if (req.isAuthenticated()) {
        const pgName = req.params.pgName;
        Pg.findOne({ name: pgName, accepted: true }, function (err, pg) {
            if (pg == null) res.send("No such type of PG exists");
            else {
                const mapURL = "https://embed.waze.com/iframe?zoom=13&lat=" + pg.latitude + "&lon=" + pg.longitude + "&pin=1";
                const comments = new Array();
                var totalRatingCount = 0;
                for (let index = 0; index < pg.commentIds.length; index++) {
                    const comId = pg.commentIds[index];
                    // console.log(comId);
                    Comment.findById(comId, function (err, oneComment) {
                        // console.log(oneComment);
                        comments.push(oneComment);
                        totalRatingCount += oneComment.score;
                        if (index == pg.commentIds.length - 1) {
                            // console.log(comments);
                            pg.avgRating = Math.round(totalRatingCount / pg.commentIds.length);
                            pg.save(function (err) {
                                if (err) console.log(err);
                                else res.render("pg", { meUser: req.user, pg: pg, mapURL: mapURL, comments: comments });
                            })
                        }
                    });
                }
                if (pg.commentIds.length == 0) {
                    res.render("pg", { meUser: req.user, pg: pg, mapURL: mapURL, comments: comments, avgRating: "Not Rated" });
                }
            }
        });
    } else {
        res.redirect("/login");
    }
});

// ----------------------------------------------------------------------------------------------------

// ------------------------------------------- New Comment Request ----------------------------------------
app.post("/comment", function (req, res) {
    const comment = new Comment({
        score: req.body.score,
        content: req.body.content,
        userId: req.user.id,
        pgId: req.body.pgID,
        username: req.user.username,
        pgName: req.body.pgName
    });
    const pgName = req.body.pgName;
    comment.save(function (err, comme) {
        if (err) console.log(err);
        else {
            User.findOneAndUpdate(
                { _id: comment.userId },
                { $push: { commentIds: comme.id }, $inc: { totalRatings: 1 } }, function (err) {
                    if (err) console.log(err);
                    else {
                        console.log("Successfully updated user");
                        Pg.findOneAndUpdate({ _id: comment.pgId },
                            { $push: { commentIds: comme.id }, $inc: { totalRatings: comme.score } }, function (err, result) {
                                if (err) console.log(err);
                                else {
                                    console.log("Successfully updated in PG");
                                    res.redirect("/pg/" + pgName);
                                }
                            });
                    }
                });

        }
    })
});

// --------------------------------------------- LOGOUT -------------------------------------------------------
app.get("/logout", function (req, res) {
    req.logout();
    res.redirect("/login");
});


// ------------------------------------------- Admin -----------------------------------------------------
app.get("/adminlogin", function (req, res) {
    if (req.isAuthenticated()) {
        if (req.user.admin == true) {
            res.render("adminlogin", { message: message, meUser: req.user });
        } else {
            res.send("You must Logout first");
        }
    } else {
        res.render("adminlogin", { message: message, meUser: -1 });
    }
});

app.post("/adminlogin", function (req, res) {
    const admin = new User({
        username: req.body.username,
        password: req.body.password
    });
    User.findOne({ username: req.body.username }, function (err, aadmi) {
        if (aadmi != null || aadmi != undefined) {
            if (aadmi.admin == true) {
                req.login(admin, function (err) {
                    if (err) {
                        console.log(err);
                        res.redirect("/adminlogin");
                    } else {
                        passport.authenticate("local")(req, res, function () {
                            res.redirect("/admin");
                        });
                    }
                });
            } else {
                res.send("You are not an admin");
            }
        } else {
            res.redirect("/adminlogin");
        }
    });
});

app.get("/admin", function (req, res) {
    if (req.isAuthenticated()) {
        if (req.user.admin != undefined && req.user.admin == true) {
            Pg.find({}, function (err, pgs) {
                res.render("admin", { message: message, meUser: req.user, pgs: pgs });
            });
        } else {
            res.send("You are not an admin");
        }
    } else {
        res.redirect("/adminlogin");
    }
});

app.get("/pgedit/:pgname", function (req, res) {
    const pgname = req.params.pgname;
    if (req.isAuthenticated()) {
        if (req.user.admin != undefined && req.user.admin == true) {
            Pg.findOne({ name: pgname }, function (err, pg) {
                res.render("pgedit", { pg: pg, message: message, meUser: req.user });
            });
        } else {
            res.send("You are not an admin");
        }
    } else {
        res.redirect("/adminlogin");
    }
});

app.post("/pgedit", function (req, res) {
    var approved = false;
    var nonveg = false;
    var ac = false;
    if (req.body.approval == "on") approved = true;
    if (req.body.nonveg == "on") nonveg = true;
    if (req.body.ac == "on") ac = true;

    Pg.updateOne({ name: req.body.name }, { $set: { latitude: req.body.latitude, longitude: req.body.longitude, price: req.body.price, city: req.body.city, photos: req.body.photos, nonveg: nonveg, ac: ac, accepted: approved } }, function (err, pg) {
        console.log(pg);
        if (err) console.log(err);
        else res.redirect("/admin");
    });
});

app.get("/delete/:pgname", function (req, res) {
    if (req.isAuthenticated()) {
        if (req.user.admin != undefined && req.user.admin == true) {
            const pgname = req.params.pgname;
            Pg.deleteOne({ name: pgname }, function (err) {
                if (err) console.log(err);
                res.redirect("/admin");
            });
        } else {
            res.send("You're not an admin");
        }
    } else {
        res.send("Please login as admin");
    }
});

app.listen(process.env.PORT || 3000, function () {
    console.log("Express server listening on port %d in %s mode", this.address().port, app.settings.env);
});
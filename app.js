import { fileURLToPath } from "url";
import path from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import express from "express";
import pkg from 'body-parser';
const { urlencoded } = pkg;
import ejs from "ejs";
import mongoose from "mongoose";

const app = express();

app.set('view engine', 'ejs');
app.use(urlencoded({extended:true}));
app.use(express.static(__dirname + "/public/"));


app.get("/", function(req, res){
    res.render("Login");
});

app.listen(3000, function(){
    console.log("Server started at port 3000");
});
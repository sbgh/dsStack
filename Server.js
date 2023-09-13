var express = require("express");
var fs = require('fs');
var bodyParser = require("body-parser");
var cors = require('cors');

var http = require('http');
//<add_Requires>

var app = express();

const corsOptions = {
    // origin: process.env.CORS_ALLOW_ORIGIN || '*',
    origin: 'https://containerPlz.cybera.ca/',
    methods: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

function customHeaders(req, res, next) {
    res.setHeader('X-Powered-By', 'ezstack.systems');
    res.setHeader('x-content-type-options', 'nosniff');
    next()
}

app.use(customHeaders);

var router = express.Router();
// all templates are located in `/views` directory
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
var viewPath = __dirname + '/views/';
app.use(express.static('static'));

global.compData = JSON.parse(fs.readFileSync(__dirname + '/compData.json'));

function generateUUID() { 
    var d = new Date().getTime();
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        d += performance.now(); //use high-precision timer if available
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = (d + Math.random() * 16) % 16 | 0;
        d = Math.floor(d / 16);
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

router.use(function (req, res, next) {
    
    var log = {
        date: new Date().toISOString().replace(/T/, '_').replace(/:/g, '-'),
        md: req.method,
        protocol: req.protocol,
        host: req.get('host'),
        pathname: req.originalUrl,
        rad: req.connection.remoteAddress,
        referrer: req.headers.referrer || req.headers.referer
    };

    fs.appendFile('access.log', JSON.stringify(log) + "\n", function (err) {
        if (err) throw err;
    });
    
    next();

});
router.get("/", function (req, res) {
    var sess = req.session;
    if (typeof sess !== 'undefined') {
        var username = sess.username;
        res.render("index", { username: username });
    } else {
        res.render("index", {});
    }
});

router.get("/getTree", function (req, res) {
    var id = req.query.id;

    res.writeHead(200, { "Content-Type": "application/json" });
    var resJSON = [];
    if (id !== '#') {
        var rowdata = compData[id];
        //console.log('gv:' + compData[id].variables);
        rowdata.id = id;
        resJSON.push(rowdata);
    } else {
        for (var key in compData) {
            if (compData.hasOwnProperty(key)) {
                var rowdata = compData[key];
                rowdata.id = key;
                resJSON.push(rowdata);
            }
        }
    }
    res.end(JSON.stringify(resJSON));
});

router.post("/saveComp",function(req,res){
    
    var reqJSON= req.body;

    let newFlag = true
    if(reqJSON.hasOwnProperty("id")){
        newFlag = reqJSON.id.trim() !== "" ? false : true
    }

    if(!newFlag){
        let id =reqJSON.id;
        compData[id].text = reqJSON.text
        compData[id].script = reqJSON.script
    }else{
        let id =generateUUID();
        compData[id] = {}
        compData[id].text = reqJSON.text
        compData[id].parent = reqJSON.parent
        compData[id].script = reqJSON.script

    }

    saveAllJSON(true)
    
    res.end('');
});

router.post("/remove",function(req,res){
    //remove id from systems json and remove /uploads/ dir
    var reqJSON= req.body;
    var ids =reqJSON.ids.split(';');
    // var tree =reqJSON.tree;

    ids.forEach(function(id) { //Loop throu all ids
        if(compData.hasOwnProperty(id)) {
            delete compData[id]; //delete from main datastore
            // rmDir(filesPath + id + "/"); //delete all uploaded files
            // fs.readdir(resultsPath, function(err, files){ // delete results files
            //     if (err){
            //         console.log(err);
            //     }else{
            //         files.forEach(function(mFile){
            //             if (mFile.substr(0,36) === id){
            //                 if (fs.statSync(resultsPath + mFile).isFile()){
            //                     //console.log("removing: " + resultsFilesPath + mFile);
            //                     fs.unlinkSync(resultsPath + mFile);
            //                 }
            //             }
            //         })
            //     }

            // });
        }
    });
    saveAllJSON(true);

    res.end('');
});

function saveAllJSON(backup){
    //console.log("saving");
    fs.writeFile(__dirname + '/compData.json', JSON.stringify(compData), function (err) {
        if (err) {
            console.log('There has been an error saving your component data json.');
            console.log(err.message);
            return;
        }else if(backup){
            console.log("backup");
            var dsString = new Date().toISOString();
            var fds = dsString.replace(/_/g, '-').replace(/T/, '-').replace(/:/g, '-').replace(/\..+/, '');
            const fname = 'compData'+fds+'.json';
            fs.writeFile(__dirname + "/backup/" + fname, JSON.stringify(compData), function (err) {
                if (err) {
                    console.log('There has been an error saving your json: /backup/'+fname);
                    console.log(err.message);
                    return;
                }else{
                    var x = 1;
                    fs.readdir(__dirname + "/backup/", function(err, files){ // delete older backups files
                        if (err){
                            console.log("Error reading " + __dirname + "/backup/ dir\n" + err);
                        }else{
                            files.forEach(function(mFile){
                                if (fs.statSync(__dirname + "/backup/" + mFile).isFile()){
                                    if((x + 20) <  files.length){
                                        //console.log("removing"  + __dirname + "/backup/" + mFile );
                                        fs.unlinkSync(__dirname + "/backup/" + mFile)
                                    }
                                    x++
                                }
                            })
                        }
                    })
                }
            })
        }
    })
}



//bodyParser must be below proxy
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

app.use("/", router);

app.use("*", function (req, res) {
    res.status(404).sendFile(__dirname + "/404.html");
    //console.log('404 '+ req.baseUrl)
});

http.createServer(app).listen('8088');
console.log("Express server listening on port 8088");
//<add_listen>

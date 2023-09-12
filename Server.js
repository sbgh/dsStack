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

global.treeData = JSON.parse(fs.readFileSync(__dirname + '/treeData.json'));

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
    if (req.originalUrl.substr(0, 18) !== "/demoMan?task=stat") {
        var log = {
            date: new Date().toISOString().replace(/T/, '_').replace(/:/g, '-'),
            md: req.method,
            protocol: req.protocol,
            host: req.get('host'),
            pathname: req.originalUrl,
            rad: req.connection.remoteAddress,
            referrer: req.headers.referrer || req.headers.referer
        };

        fs.appendFile('accesslog.txt', JSON.stringify(log) + "\n", function (err) {
            if (err) throw err;
            //console.log('Saved!');
        });
    }
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
        var rowdata = treeData[id];
        //console.log('gv:' + treeData[id].variables);
        rowdata.id = id;
        resJSON.push(rowdata);
    } else {
        for (var key in treeData) {
            if (treeData.hasOwnProperty(key)) {
                var rowdata = treeData[key];
                rowdata.id = key;
                resJSON.push(rowdata);
            }
        }
    }
    res.end(JSON.stringify(resJSON));
});

router.post("/saveComp",function(req,res){
    
    var reqJSON= req.body;
    var ids =reqJSON.id;
    



    res.end('');
});



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

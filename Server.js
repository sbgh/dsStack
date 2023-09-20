var express = require("express");

var WebSocket = require('ws');

var fs = require('fs');
var bodyParser = require("body-parser");
var cors = require('cors');

var http = require('http');
const https = require('https');

const Client = require('ssh2').Client
const formidable = require('formidable');

var app = express();

const corsOptions = {
    // origin: process.env.CORS_ALLOW_ORIGIN || '*',
    origin: 'https://coonsol.cybera.ca/',
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

const config = { "username": "admin" }

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

    var rowdata = compData[id];

    var searchSt = ""
    if (req.query.hasOwnProperty("searchSt")) {
        if (req.query.searchSt.trim() !== "") {
            searchSt = req.query.searchSt.toLowerCase()
        }
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    var resJSON = [];
    if (id !== '#') {

        //console.log('gv:' + compData[id].variables);
        rowdata.id = id;

        resJSON.push(rowdata);
    } else {
        var found = false
        var foundIds = [];
        for (var key in compData) {
            if (compData.hasOwnProperty(key)) {
                var rowdata = compData[key];

                found = false
                if (searchSt === "" || !rowdata.hasOwnProperty("text") || !rowdata.hasOwnProperty("description") || !rowdata.hasOwnProperty("script")) {
                    found = true
                } else
                    if (rowdata.text.toLowerCase().includes(searchSt)) {
                        found = true
                        rowdata.found = true
                    } else if (rowdata.description.ops.some(str => str.insert.toLowerCase().includes(searchSt))) {
                        found = true
                        rowdata.found = true
                    } else if (rowdata.script.toLowerCase().includes(searchSt)) {
                        found = true
                        rowdata.found = true
                    }

                if (found === true) {

                    var a = compData[key].parent
                    while (a && a !== '#') {
                        if (!foundIds.includes(compData[a].id)) {
                            resJSON.unshift(compData[a])
                            foundIds.push(a)
                        }
                        a = compData[a].parent
                    }

                    rowdata.id = key
                    rowdata.type = "code"
                    resJSON.push(rowdata)
                    foundIds.push(key)
                }
            }
        }
    }
    res.end(JSON.stringify(resJSON));
});

router.post("/saveComp", function (req, res) {

    var reqJSON = req.body;
    var retId = ""

    let newFlag = true
    if (reqJSON.hasOwnProperty("id")) {
        newFlag = reqJSON.id.trim() !== "" ? false : true
    }

    if (!newFlag) {
        let id = reqJSON.id;
        retId = id
        compData[id].text = reqJSON.text
        compData[id].script = reqJSON.script
        compData[id].description = reqJSON.description
    } else {
        let id = generateUUID();
        retId = id
        compData[id] = {}
        compData[id].text = reqJSON.text
        compData[id].parent = reqJSON.parent
        compData[id].script = reqJSON.script
        compData[id].description = reqJSON.description

    }

    saveAllJSON(true)

    res.end(retId);
});

router.post("/remove", function (req, res) {
    //remove id from systems json and remove /uploads/ dir
    var reqJSON = req.body;
    var ids = reqJSON.ids.split(';');
    // var tree =reqJSON.tree;

    ids.forEach(function (id) { //Loop throu all ids
        if (compData.hasOwnProperty(id)) {
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

router.post("/copy", function (req, res) {
    var reqJSON = req.body;

    var fromIds = reqJSON.ids.split(';');
    var targetId = reqJSON.parent;
    var position = reqJSON.pos;
    // var lib = reqJSON.lib;

    var error = false;
    var errorID = '';

    //Set error flag if target not exist
    if ((!compData.hasOwnProperty(targetId)) && (targetId !== '#')) {
        error = true;
        errorID = targetId;
    }

    //set error flag if from ID not exist
    fromIds.forEach(function (id) {
        if (!compData.hasOwnProperty(id) && error === false) {
            error = true;
            errorID = id;
        }
    });

    //If no error
    if (error === false) {

        //build id map of old parents and new parents
        var idMap = {};

        //add from parent and new parent to id map
        idMap[compData[fromIds[0]].parent] = targetId;

        //loop through all fromIds and copy
        fromIds.forEach(function (fromId) {
            var fromNode = compData[fromId];
            var id = generateUUID();

            //update parent id map
            idMap[fromId] = id;
            var newParentId = idMap[compData[fromId].parent];
            //console.log('move to:'+compData[newParentId].name);

            //initial history json
            var ds = new Date().toISOString();
            var hist = [{ username: config.username, ds: ds, fromId: fromId }];

            //Build new component obj. Version 1
            var NewRow = {
                parent: newParentId,
                text: fromNode.text,
                // description: fromNode.description,
                // ver: 1,
                // comType: fromNode.comType,
                // sort: fromNode.sort,
                // text: fromNode.name,
                hist: hist
            };

            //Add new family tree
            // if (newParentId === "#") {
            //     NewRow.ft = "#"
            // } else {
            //     NewRow.ft = compData[newParentId].ft + '/' + newParentId;
            // }

            //Add more properties to the new component obj if type = 'job' (ie component)
            if (fromNode.comType === 'job') {
                NewRow.enabled = fromNode.enabled;
                NewRow.promoted = fromNode.promoted;

                NewRow.variables = {};
                //copy vars that are not private
                for (var ind in compData[fromId].variables) {
                    if (compData[fromId].variables.hasOwnProperty(ind)) {
                        if (!fromNode.variables[ind].private) {
                            NewRow.variables[ind] = fromNode.variables[ind]
                        } else {
                            NewRow.variables[ind] = JSON.parse(JSON.stringify(fromNode.variables[ind]));
                            NewRow.variables[ind].value = "";
                        }
                    }
                }

                // NewRow.icon = fromNode.icon;

                NewRow.script = fromNode.script;

                if (fromNode.hasOwnProperty('thumbnail')) {
                    NewRow.thumbnail = fromNode.thumbnail;
                }
            }

            compData[id] = NewRow;

            //Copy file resources
            // if (fs.existsSync(filesPath + fromId)) { //copy file resources if they exist
            //     fs.mkdirSync(filesPath + id);
            //     const files = fs.readdirSync(filesPath + fromId);
            //     files.forEach(function (file) {
            //         if (!fs.lstatSync(filesPath + fromId + '/' + file).isDirectory()) {
            //             const targetFile = filesPath + id + '/' + file;
            //             const source = filesPath + fromId + '/' + file;
            //             fs.writeFileSync(targetFile, fs.readFileSync(source))
            //         }
            //     })
            // }
        });

        //add new sort order value to the 1st id
        var posInt = parseInt(position, 10);
        for (var key in compData) {
            if (compData[key].parent === targetId) {
                if (compData[key].sort >= posInt) {
                    compData[key].sort = compData[key].sort + 1;
                }
            }
        }
        compData[idMap[fromIds[0]]].sort = posInt;
        fixChildsSort(targetId);

        //Save compData and backup
        saveAllJSON(true);

        //Return OK status
        res.sendStatus(200);
        res.end('');
        //console.log("saving script"+ JSON.stringify(foundRow));

    } else {
        //error detected. Return error message
        res.sendStatus(500);
        res.end("Error:System ID not found - " + errorID)
    }

});

router.get("/move", function (req, res) {
    //console.log("move...");
    var id = req.query.id;
    var direction = req.query.direction[0]; //either u or d
    var oldPos = compData[id].sort;
    var otherId = "";

    if (!id || !direction) {
        res.end('');
    }

    var parent = compData[id].parent;

    fixChildsSort(parent);

    var beforeId = '';
    var afterId = '';

    //get all siblings
    var siblings = [];
    for (var key in compData) {
        if (compData.hasOwnProperty(key)) {
            if (parent === compData[key].parent) {
                //console.log("found: " , compData[key].name,  compData[key].sort, parent , compData[key].parent);
                siblings.push(key);
            }
        }
    }

    //sort
    siblings.sort((a, b) => (compData[a].sort > compData[b].sort) ? 1 : -1);

    //re-apply sort # because there could be dups or gaps
    var x = 0;
    for (var key in siblings) {
        compData[siblings[key]].sort = x;
        x++
    }

    //find the before and after ids
    for (var key in siblings) {
        if (compData[id].sort + 1 === compData[siblings[key]].sort) {
            afterId = siblings[key]
        }
        if (compData[id].sort - 1 === compData[siblings[key]].sort) {
            beforeId = siblings[key]
        }
    }

    if (direction === 'u' && beforeId !== '') {
        var tmp = compData[beforeId].sort;
        compData[beforeId].sort = compData[id].sort;
        compData[id].sort = tmp;
        otherId = beforeId;
    }

    //set new sort para for current and after if down
    if (direction === 'd' && afterId !== '') {
        var tmp = compData[afterId].sort;
        compData[afterId].sort = compData[id].sort;
        compData[id].sort = tmp;
        otherId = afterId;
    }

    //Save the resorted SystemJSON
    saveAllJSON(true);

    var newPos = compData[id].sort;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ "newPos": newPos, "oldPos": oldPos, "otherId": otherId }));

});


function fixChildsSort(parentId) {
    //get all siblings
    var siblings = [];
    for (var key in compData) {
        if (compData.hasOwnProperty(key)) {
            if (parentId === compData[key].parent) {
                siblings.push(key);
            }
        }
    }

    //sort
    siblings.sort((a, b) => (compData[a].sort > compData[b].sort) ? 1 : -1);

    //re-apply sort # because there could be dups or gaps
    var x = 0;
    for (var key in siblings) {
        compData[siblings[key]].sort = x;
        x++
    }
}

var connections = []
function getConn(conOptions, ids, res, callback) {
    let token = conOptions.token

    let found = false
    connections.forEach(function (value, index, array) {
        if (value.token === token){
            callback(ids, connections[index].stream, connections[index].token)
            found = true
        }
    });



    if (found !== true) {
        // connections = []

        var c = new Client();

        c.connect(conOptions);
        c.on('error', function (err) {
            console.log('SSH - Connection Error: ' + err);
        });

        //connection end event.
        c.on('end', function () {

        });

        //connection ready event. 
        c.on('ready', function () {
            c.shell(function (err, stream) {
                let token = generateUUID()
                let conObj = { "err": err, "conn": c, "stream": stream, "token": token }
                connections.push(conObj)

                streamEvents(stream, res)
                stream.write('stty cols 200' + '\n' + "PS1='[SysStack] '" + '\n'); //set prompt

                callback(ids, stream, token)
            })
        });

    // } else {
    //     callback(ids, connections[0].stream, connections[0].token)
    }
}

router.post("/run", function (req, res) {

    var form = new formidable.IncomingForm();

    form.parse(req, function (err, fields, files) {
        if (err) {
            console.log(err);
            //message(err);
        } else {

            ids = fields.ids[0];
            runChildren = fields.runChildren[0];

            settingsHostName = fields.settingsHostName[0];
            settingsLoginName = fields.settingsLoginName[0];
            settingsKey = fields.settingsKey[0];
            token = fields.token[0];

        }
    });
    form.multiples = false;
    form.uploadDir = __dirname;

    // log any errors
    form.on('error', function (err) {
        console.log('An error has occured.\n/run \n' + err);
    });

    // once form is uploaded, run first component
    form.on('end', function () {
        res.setHeader('Connection', 'Transfer-Encoding')
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
        res.setHeader('Transfer-Encoding', 'chunked')


        conOptions = {
            "host": settingsHostName,
            "port": '22',
            "username": settingsLoginName,
            "privateKey": settingsKey,
            "token": token
        }
        getConn(conOptions, ids, res, runScript)

    })

    function runScript(id, stream, token) {
        res.setHeader("access-Token", token)

        var respBufferAccu = new Buffer.from([]);
        var prompt = "[SysStack]";

        // res.write("running: " + id+ '\n');
        stream.write("#running: " + id + '\n');

        const script = compData[id].script ? compData[id].script.split("\n") : ""
        var lineInx = 0

        stream.removeAllListeners('data');

        stream.on('data', function (data) {
            //send data to ui
            // if (data[0] == 8) {   //"\b\u001b[K\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000"
            //     console.log("res k " + data.toString());
            //     res.write(8);
            // }else{
                res.write(data.toString());
                console.log("res write not del " + data)
            // }
            // console.log("res write")

            respBufferAccu = Buffer.concat([respBufferAccu, data]);

            if (respBufferAccu.toString().includes(prompt)) {
                respBufferAccu = new Buffer.from([]);

                if (lineInx < script.length) {
                    stream.write(script[lineInx] + '\n');
                } else if (lineInx === script.length) {
                    // console.log("res end")
                    // res.end()
                }
                lineInx++
            }
        });
    }


});

function streamEvents(stream, res) {

    stream.on('close', function (code, signal) {
        var dsString = new Date().toISOString(); //date stamp
        console.log('Stream close: ' + dsString);
        res.end();

    });

    stream.stderr.on('data', function (data) {
        console.log('STDERR: ' + data);
        res.end('STDERR: ' + data);
    });
}

function saveAllJSON(backup) {
    //console.log("saving");
    fs.writeFile(__dirname + '/compData.json', JSON.stringify(compData), function (err) {
        if (err) {
            console.log('There has been an error saving your component data json.');
            console.log(err.message);
            return;
        } else if (backup) {
            console.log("backup");
            var dsString = new Date().toISOString();
            var fds = dsString.replace(/_/g, '-').replace(/T/, '-').replace(/:/g, '-').replace(/\..+/, '');
            const fname = 'compData' + fds + '.json';
            fs.writeFile(__dirname + "/backup/" + fname, JSON.stringify(compData), function (err) {
                if (err) {
                    console.log('There has been an error saving your json: /backup/' + fname);
                    console.log(err.message);
                    return;
                } else {
                    var x = 1;
                    fs.readdir(__dirname + "/backup/", function (err, files) { // delete older backups files
                        if (err) {
                            console.log("Error reading " + __dirname + "/backup/ dir\n" + err);
                        } else {
                            files.forEach(function (mFile) {
                                if (fs.statSync(__dirname + "/backup/" + mFile).isFile()) {
                                    if ((x + 20) < files.length) {
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
});

// http.createServer(app).listen('80');
// console.log("Express server listening on port 80");

var secureServer = https.createServer({
    key: fs.readFileSync('/home/ubuntu/.ssh/privkey.pem'),
    cert: fs.readFileSync('/home/ubuntu/.ssh/fullchain.pem'),
    rejectUnauthorized: false
}, app).listen('8443', function () {
    console.log("Secure Express server listening on port 8443");
});

var wsserver = new WebSocket.Server({ server: secureServer });

wsserver.on('connection', function connection(ws) {
    ws.on('message', function (data, isBinary) {
        var message = JSON.parse(data.toString())

        connections.forEach(function (value, index, array) {
            if (value.token === message.token){
                stream = value.stream
                let key  = message.key
                stream.write(key)
                console.log("key: " + message.key)
            }
        });

        // if (connections.length > 0) {
        //     stream = connections[0].stream
        //     stream.write(message)
        // }
        // console.log('received:', message);
    });

    //   ws.send('something');
});

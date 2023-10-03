var express = require("express");

var WebSocket = require('ws');

var fs = require('fs');
var bodyParser = require("body-parser");
var cors = require('cors');

var http = require('http');
const https = require('https');

const Client = require('ssh2').Client
// const formidable = require('formidable');

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
const viewPath = __dirname + '/views/';
const stylesPath = __dirname + '/static/theme/';
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
                    } else if (compData[key].description.hasOwnProperty("ops")) {
                        compData[key].description.ops.forEach(function (row) {
                            if (row.hasOwnProperty("insert")) {
                                var rTxt = row.insert;
                                if (rTxt.hasOwnProperty("includes")) { //could be image
                                    if (rTxt.includes(searchSt)) {
                                        found = true
                                    }
                                }
                            }
                        })
                    } else if (rowdata.script.toLowerCase().includes(searchSt)) {
                        found = true
                        rowdata.found = true
                    }

                if (found === true) {

                    var a = compData[key].parent
                    var x = 0
                    while (a && a !== '#') {
                        if (!foundIds.includes(compData[a].id)) {
                            resJSON.unshift(compData[a])
                            foundIds.push(a)
                        }
                        a = compData[a].parent
                        x++
                        if (x > 100) {
                            console.log("Error: too many grand parents found during search [" + key + "]")
                            res.end("500")
                            return ("Error: too many grand parents found during search [" + key + "]")
                        }
                    }

                    rowdata.id = key
                    rowdata.type = "code"
                    resJSON.push(rowdata)
                    foundIds.push(key)
                } else {

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
        compData[id].variables = reqJSON.compVariables
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
                description: fromNode.description,
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
            // if (fromNode.comType === 'job') {
            // NewRow.enabled = fromNode.enabled;
            // NewRow.promoted = fromNode.promoted;

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

            // if (fromNode.hasOwnProperty('thumbnail')) {
            //     NewRow.thumbnail = fromNode.thumbnail;
            // }
            // }

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

//Create and register connection or lookup connection
function getConn(conOptions, callback) {
    let token = conOptions.token
    let ids = conOptions.ids ? conOptions.ids : []
    let ws = conOptions.ws
    let key = conOptions.key
    // let key = conOptions.settingsKey
    // let found = false
    let conn = false
    connections.forEach(function (value, index, array) {
        if (value.token === token) {
            conn = connections[index]
        }
    });

    if (conn) {
        conn.key = key
        conn.ids = ids
        callback(conn)
    } else {
        let c = new Client();

        if (!conOptions.username || !conOptions.privateKey || !conOptions.host) {
            let mess = JSON.stringify({
                "message": "\r\n# Not Connected to SSH host\r\n",
                "status": "down"
            })
            ws.send(mess)

        } else {

            try {
                c.connect(conOptions);

                c.on('error', function (err) {
                    console.log('SSH - Connection Error: ' + err);
                    let mess = JSON.stringify({
                        "message": "\r\n# Error: Connection error\r\n" + err + "\r\n",
                        "status": "down"
                    })
                    ws.send(mess)
                    connections.every((element, index, array) => {
                        if (element.token === token) {
                            delete connections[index]
                            return false;
                        }
                        return true;
                    });
                });

                //connection end event.
                c.on('end', function () {
                    console.log('SSH - Connection ended');
                    let mess = JSON.stringify({
                        "message": "\r\n# SSH connection ended\r\n",
                        "status": "down"
                    })
                    ws.send(mess)
                    connections.every((element, index, array) => {
                        if (element.token === token) {
                            delete connections[index]
                            return false;
                        }
                        return true;
                    });
                });

                //connection ready event. 
                c.on('ready', function () {
                    c.shell(function (err, stream) {
                        let token = generateUUID()
                        let conObj = { "err": err, "conn": c, "stream": stream, "token": token, "ids": ids, "key": key }

                        connections.push(conObj)

                        stream.token = token
                        streamEvents(conObj, ws)
                        let mess = JSON.stringify({
                            "status": "up"
                        })
                        stream.write('stty cols 200' + '\n' + 'PS1="[ceStack]$PS1"' + '\n'); //insert [ceStack] into the current prompt

                        callback(conObj)
                    })
                });
            } catch (error) {
                console.log('SSH - Connection Error: ' + error);
                let mess = JSON.stringify({
                    "message": "# Error: Connection error\r\n" + error + "\r\n",
                    "status": "down"
                })
                ws.send(mess)
            }
        }


    }
}

// function lookupConn(token) {
//     connections.forEach(function (value, index, array) {
//         if (value.token === token) {
//             return (true)
//         }
//     });
//     return (false)
// }
router.post("/run", function (req, res) {

    var form = new formidable.IncomingForm();

    form.parse(req, function (err, fields, files) {
        if (err) {
            console.log(err);
            //message(err);
        } else {

            ids = fields.ids;
            runChildren = fields.runChildren[0];

            settingsHostName = fields.settingsHostName[0];
            settingsLoginName = fields.settingsLoginName[0];
            settingsKey = fields.settingsKey[0];
            token = fields.token[0];
            // saveHost = fields.saveHost[0];
            // savePath = fields.savePath[0];

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
            // ,
            // "saveHost": saveHost,
            // "savePath": savePath
        }
        getConn(conOptions, ids, res, runScript)

    })

    function runScript(ids, stream) {
        // res.setHeader("access-Token", token)

        var respBufferAccu = new Buffer.from([]);
        var prompt = "[ceStack]";

        var script = ''
        if (ids.length == 1 && ids[0].trim() == "") {
            stream.write("\n");
            script = "\n"
        } else if (ids.length == 0) {
            stream.write("\n");
            script = "\n"
        } else {
            let id = ids[0]
            stream.write("#running: " + compData[id].text + '\n');
            script = compData[id].script ? compData[id].script.split("\n") : ""
        }
        var lineInx = 0

        stream.removeAllListeners('data');

        stream.on('data', function (data) {
            res.write(data.toString());
            console.log("res write not del " + data)

            respBufferAccu = Buffer.concat([respBufferAccu, data]);

            if (respBufferAccu.toString().includes(prompt)) {
                respBufferAccu = new Buffer.from([]);

                if (lineInx < script.length) {
                    var command = ""
                    if (compData.hasOwnProperty(ids[0])) {
                        command = replaceVar(script[lineInx], compData[ids[0]])
                    } else {
                        command = ''
                    }

                    stream.write(command + '\n');
                } else if (lineInx === script.length) {

                }
                lineInx++
            }
        });
    }


});

function streamEvents(conn, ws) {
    let stream = conn.stream

    // var respBufferAccu = new Buffer.from([]);
    // var prompt = "[ceStack]";

    // var script = ''
    // if (ids.length == 1 && ids[0].trim() == "") {
    //     stream.write("\n");
    //     script = "\n"
    // } else if (ids.length == 0) {
    //     stream.write("\n");
    //     script = "\n"
    // } else {
    //     let id = ids[0]
    //     stream.write("#running: " + compData[id].text + '\n');
    //     script = compData[id].script ? compData[id].script.split("\n") : ""
    // }
    // var lineInx = 0


    stream.on('data', function (data) {
        let token = this.token

        mess = JSON.stringify({
            "message": data.toString(),
            "status": "up"
        })
        ws.send(mess)

        connections.forEach(function (value, index, array) {
            if (value.token === token) {
                let ids = value.ids
                let ind = value.index

                if (compData[ids[0]] && compData[ids[0]].script) {
                    let script = compData[ids[0]].script
                    let lines = script.split('\n')
                    if (connections[index].index < lines.length) {
                        let command = replaceVar(lines[ind], compData[ids[0]])
                        stream.write(command + '\n');
                        connections[index].index++
                    }

                }

            }

            function replaceVar(commandStr, job) {// find and replace inserted command vars eg. {{p.mVar4}}

                const items = commandStr.split(new RegExp('{{', 'g'));
                items.forEach(function (item) {
                    item = item.substr(0, item.indexOf('}}'));

                    if (item.length > 2 && item.length < 32 && item.substr(0, 2) === 'c.') {
                        var targetVarName = item.substr(2);
                        var pid = job.parent;
                        var repStr = "{{c." + targetVarName + "}}";
                        if (job.variables[targetVarName]) {
                            var val = job.variables[targetVarName].value;
                            commandStr = commandStr.replace(repStr, val)
                        }
                    }
                });

                //If there are any {{ patterns left in the line then raise error and abort
                const remainingItemsCount = commandStr.split(new RegExp('{{', 'g')).length;
                const remainingItems = commandStr.split(new RegExp('{{', 'g'));
                if (remainingItemsCount > 1) {
                    var item = remainingItems[1]
                    item = item.substr(0, item.indexOf('}}'));

                    if (item.length > 2 && item.length < 32) {
                        //console.log("Error: Component Variable not found: " + item + '\n');
                        message("Error: Component Variable not found: " + item + '\n');
                        flushMessQueue();
                        sshSuccess = false;
                        // stream.close();
                        return ('');
                    }
                }
                return (commandStr);
            }



        });

        // console.log("res write not del " + data)

        // respBufferAccu = Buffer.concat([respBufferAccu, data]);

        // if (respBufferAccu.toString().includes(prompt)) {
        //     respBufferAccu = new Buffer.from([]);

        //     if (lineInx < script.length) {
        //         var command = ""
        //         if (compData.hasOwnProperty(ids[0])) {
        //             command = replaceVar(script[lineInx], compData[ids[0]])
        //         } else {
        //             command = ''
        //         }

        //         stream.write(command + '\n');
        //     } else if (lineInx === script.length) {

        //     }
        //     lineInx++
        // }

    });

    stream.on('close', function (code, signal) {
        var dsString = new Date().toISOString(); //date stamp
        console.log('Stream close: ' + dsString);
        let token = this.token

        let mess = JSON.stringify({
            "message": "\r\n# SSH Stream closed\r\n",
            "status": "down"
        })
        ws.send(mess)


        connections.every((element, index, array) => {
            if (element.token === token) {
                delete connections[index]
                return false;
            }
            return true;
        });

        // connections.forEach(function (value, index, array) {
        //     if (value.token === token) {
        //         delete connections[index]
        //     }
        // })
    });

    stream.stderr.on('data', function (data) {
        console.log('STDERR: ' + data);
        let token = this.token

        let mess = JSON.stringify({
            "message": "# SSH Stream Error\r\n" + data,
            "status": "down"
        })
        ws.send(mess)
        connections.every((element, index, array) => {
            if (element.token === token) {
                delete connections[index]
                return false;
            }
            return true;
        });
    });
}

router.get("/getStyle", function (req, res) {
    var styleName = req.query.styleName;

    //If user config does not have property to store style then add default as current style.
    if (styleName === 'dark') {//return dark.css
        try {
            var cssJson = fs.readFileSync(stylesPath + 'dark.css').toString();

            res.writeHead(200, { "Content-Type": "application/json" });
            const respJson = { css: cssJson };
            res.end(JSON.stringify(respJson));
        } catch (e) {
            res.writeHead(300, { "Content-Type": "text/plain" });
            res.end('');
            throw e;
        }
    } else { //return default.css
        try {
            var cssJson = fs.readFileSync(stylesPath + 'default.css').toString();

            res.writeHead(200, { "Content-Type": "application/json" });
            const respJson = { css: cssJson };
            res.end(JSON.stringify(respJson));
        } catch (e) {
            res.writeHead(300, { "Content-Type": "text/plain" });
            res.end('');
            throw e;
        }
    }

});


function saveAllJSON(backup, token) {
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

    function processMessage(conn) {

        let mess = ""

        if (!conn.token) {
            mess = JSON.stringify({
                "token": "",
                "message": "Connection Failed\r\n",
                "status": "down"
            })
            ws.send(mess)
        } else {
            mess = JSON.stringify({
                "token": conn.token,
                "status": "up"
            })
            ws.send(mess)

            if (conn.key) {
                let key = conn.key
                conn.stream.write(key)
            } else if (conn.ids[0]) {
                let id = conn.ids[0]
                conn.stream.write("#running: " + compData[id].text + '\n')
                conn.index = 0
            } else {
                conn.stream.write("\n")
            }
        }
    }

    ws.on('message', function (data, isBinary) {
        var dataObj = JSON.parse(data.toString())
        conOptions = {
            "host": dataObj.settingsHostName,
            "port": '22',
            "username": dataObj.settingsLoginName,
            "privateKey": dataObj.settingsKey,
            "token": dataObj.token,
            "ids": dataObj.ids,
            "ws": ws,
            "key": dataObj.key
        }
        getConn(conOptions, processMessage)

    });

});

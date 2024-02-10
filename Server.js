var express = require("express");

var WebSocket = require('ws');

var fs = require('fs');
var bodyParser = require("body-parser");
var cors = require('cors');

var http = require('http');
const https = require('https');

const Client = require('ssh2').Client

var app = express();

(function () {
    var old = console.log;
    console.log("> Log Date Format DD/MM/YY HH:MM:SS - UTCString");
    console.log = function () {
        var n = new Date();
        var d = ("0" + (n.getDate().toString())).slice(-2),
            m = ("0" + ((n.getMonth() + 1).toString())).slice(-2),
            y = ("0" + (n.getFullYear().toString())).slice(-2),
            t = n.toUTCString().slice(-13, -4);
        Array.prototype.unshift.call(arguments, "[" + d + "/" + m + "/" + y + t + "]");
        old.apply(this, arguments);
    }
})();

const corsOptions = {
    // origin: process.env.CORS_ALLOW_ORIGIN || '*',
    origin: 'https://coonsol.cybera.ca/',
    methods: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

function customHeaders(req, res, next) {
    res.setHeader('X-Powered-By', 'dsStack');
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

global.compDataObj = {}
global.compDataObj = { "0": JSON.parse(fs.readFileSync(__dirname + '/compData.json')) }

// compDataObj["93dee0ac-da81-4f07-a503-ef7b0b02aa43"] = compDataObj[0]

// const config = { "username": "admin" }

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

    fs.appendFile('dsStack_access.log', JSON.stringify(log) + "\n", function (err) {
        if (err) throw err;
    });

    next();

});

//redirect from consol 
router.use(function (req, res, next) {

    if (req.get('host') === "consol.cybera.ca:8443") {
        res.redirect(301, 'https://dsstack.cybera.ca:8443');
    } else {
        next();
    }

});
//redirect from dsman 
router.use(function (req, res, next) {

    if (req.get('host') === "dsman.cybera.ca:8443") {
        res.redirect(301, 'https://dsstack.cybera.ca:8443/dsman');
    } else {
        next();
    }

});

router.get("/", function (req, res) {
    res.render("index", { manager: false });
});

router.get("/dsman", function (req, res) {
    res.render("dsman", { manager: true })
});

router.get("/getTree", function (req, res) {
    var id = req.query.id;

    var userID = req.query.userID;
    
    var compData = {}
    //if compDataObj does not contain user's component data, attenpt to load user's component file if it exists
    if (!compDataObj[userID]) {
        // log("! compDataObj[userID]")
        fs.readFile(__dirname + '/compData/compData.' + userID + '.json', (err, data) => {
            if (!err && data) {
                // log("!err && data")
                log("Loaded /compData/compData." + userID + ".json")
                compDataObj[userID] = JSON.parse(data)
                compData = compDataObj[userID]
                buildTree(id, compData)
            } else {
                log("Did not load /compData/compData." + userID + ".json")
                compData = compDataObj["0"]
                buildTree(id, compData)
            }
        })
    } else if (Object.keys(compDataObj[userID]).length === 0) {
        // log("compDataObj[userID]).length === 0")
        compData = compDataObj["0"]
        buildTree(id, compData)
    } else {
        // log("else", userID)
        compData = compDataObj[userID]
        buildTree(id, compData)
    }

    //builds the return json for node(s) and responds to req 
    function buildTree(id, compData) {

        var searchSt = ""
        if (req.query.hasOwnProperty("searchSt")) {
            if (req.query.searchSt.trim() !== "") {
                searchSt = req.query.searchSt.toLowerCase()
            }
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        var resJSON = [];
        if (id !== '#') {
            // if (compData.hasOwnProperty(key)) {
            let rowdata = compData[id];
            // rowdata.id = id;
            resJSON.push(rowdata);

        } else {
            var found = false
            var foundIds = [];
            for (var key in compData) {
                if (compData.hasOwnProperty(key)) {
                    let rowdata = compData[key];

                    found = false
                    // if (searchSt === "" || !rowdata.hasOwnProperty("text") || !rowdata.hasOwnProperty("description") || !rowdata.hasOwnProperty("script")) {
                    if (searchSt === "") {
                        found = true
                    } else if (rowdata.hasOwnProperty("text") && rowdata.text.toLowerCase().includes(searchSt)) {
                        found = true
                        rowdata.found = true
                    } else if (rowdata.hasOwnProperty("description") && compData[key].description.hasOwnProperty("ops")) {
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
                    } else if (rowdata.hasOwnProperty("script") && rowdata.script.toLowerCase().includes(searchSt)) {
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
                                log("Error: too many grand parents found during search [" + key + "]")
                                res.end("500")
                                return ("Error: too many grand parents found during search [" + key + "]")
                            }
                        }

                        rowdata.id = key

                        if (!rowdata.hasOwnProperty("enabled") || rowdata.enabled !== "true") {
                            rowdata.type = "disabled"
                        } else {
                            rowdata.type = "code"
                        }

                        resJSON.push(rowdata)
                        foundIds.push(key)
                    } else {

                    }
                }
            }
        }
        res.end(JSON.stringify(resJSON));
    }
});

// Save existing component or create new.
router.post("/saveComp", function (req, res) {

    var reqJSON = req.body;
    let userID = reqJSON.userID
    let userName = reqJSON.userName
    var retId = ""

    let newFlag = true
    var compData
    if (!reqJSON.hasOwnProperty("userID")) {
        log("saveComp error: reqJSON does not have property userID")
        res.end("saveComp error: reqJSON does not have property userID");
    } else if (!reqJSON.hasOwnProperty("id")) {
        log("saveComp error: reqJSON does not have property id")
        res.end("saveComp error: reqJSON does not have property id")
    } else if (userID == "0") {
        log("saveComp error: Cannot save to default ID 0")
        res.end("saveComp error: Cannot save to default ID 0")
    } else if (!compDataObj[userID]) {
        log("saveComp error: compDataObj does not have property userID")
        res.end("saveComp error: compDataObj does not have property userID")
    } else {
        if (Object.keys(compDataObj[userID]).length === 0) {
            compDataObj[userID] = compDataObj["0"]
        }

        compData = compDataObj[userID]

        newFlag = reqJSON.id.trim() !== "" ? false : true

        let id
        if (!newFlag) {
            id = reqJSON.id;
            retId = id
            compData[id].text = reqJSON.text
            compData[id].script = reqJSON.script
            compData[id].description = reqJSON.description
            compData[id].variables = reqJSON.compVariables
            var ds = new Date().toISOString();
            if (compData[id].hist) {
                compData[id].hist.push({ ds: ds, event: "save", userName: userName })
            } else {
                let hist = [{ ds: ds, event: "save", userName: userName }]
                compData[id].hist = hist
            }
        } else {
            id = generateUUID();
            retId = id
            compData[id] = {}
            compData[id].text = reqJSON.text
            compData[id].parent = reqJSON.parent
            compData[id].script = reqJSON.script
            compData[id].description = reqJSON.description
            compData[id].sort = 9000
            var ds = new Date().toISOString();
            let hist = [{ ds: ds, event: "new", userName: userName }]
            compData[id].hist = hist

        }

        saveAllJSON(true, userID, [id])

        log("Saved " + userID + " for " + userName)
        res.end(retId);
    }
});

// Delete components from the users compdata. Req should include ids array attrib and userID attrib. 
// Include all children IDs 
router.post("/remove", function (req, res) {

    var reqJSON = req.body;

    log("Remove comp(s) " + reqJSON.ids + " for "+ reqJSON.userName)
    if (reqJSON.ids && reqJSON.userID) {
        var userID = reqJSON.userID
        if (userID === "0" || !compDataObj[userID]) {
            log("remove error: compDataObj does not have property userID")
            res.end("remove error: compDataObj does not have property userID")
        } else {
            var compData = compDataObj[userID]
            var ids = reqJSON.ids.split(';');

            // let index = 0
            ids.forEach(function (id) { //Loop throu all ids
                if (compData.hasOwnProperty(id)) {
                    delete compData[id];
                    // compData.splice(index, 1)
                    // index++
                }
            });

            saveAllJSON(true, userID, []);
        }
    }
    res.end('');
});

router.post("/copy", function (req, res) {
    var reqJSON = req.body;

    var userID = reqJSON.userID
    var userName = reqJSON.userName
    var errorMsg = ""


    if (userID === "0" || !compDataObj[userID]) {
        log("copy error: compDataObj does not have property userID")
        errorMsg = "copy error: compDataObj does not have property userID"
    } else {
        var compData = compDataObj[userID]

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
            errorMsg = "target not exist"
        }

        //set error flag if from ID(s) not exist
        fromIds.forEach(function (id) {
            if (!compData.hasOwnProperty(id) && error === false) {
                error = true;
                errorID = id;
            }
            errorMsg = "from ID(s) not exist"
        });

        //Ensure move flag is present
        if (!reqJSON.move) {
            log("copy error: move flag is absent in request")
            res.end("copy error:  move flag is absent in request")
            error = true;
            errorID = targetId;
            errorMsg = "move flag is absent in request"
        }

        //If no error
        if (error === false) {

            if (reqJSON.move === "true") {


                compData[fromIds[0]].parent = targetId


                fixChildsSort(targetId, userID);

                //Save compData and backup
                saveAllJSON(true, userID, []);

                //Return OK status
                res.sendStatus(200);
                res.end('');
            } else {
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
                    //log('move to:'+compData[newParentId].name);

                    //initial history json
                    var ds = new Date().toISOString();
                    // var hist = [{ username: config.username, ds: ds, fromId: fromId }];
                    var hist = [{ ds: ds, fromId: fromId, userName: userName }];

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

                    //if 1st component append "new" to name
                    if (fromIds[0] === fromNode.id) {
                        NewRow.text = "new " + NewRow.text
                    }

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
                fixChildsSort(targetId, userID);

                //Save compData and backup
                saveAllJSON(true, userID, []);

                //Return OK status
                res.sendStatus(200);
                res.end('');
                //log("saving script"+ JSON.stringify(foundRow));

            }


        } else {
            //error detected. Return error message
            res.sendStatus(500);
            res.end(errorMsg + " - " + errorID)
        }
    }

});

router.get("/move", function (req, res) {
    //log("move...");

    var userID = req.query.userID
    if (!compDataObj[userID]) {
        log("move error: compDataObj does not have property userID")
        res.end("move error: compDataObj does not have property userID")
    } else {
        var compData = compDataObj[userID]

        var id = req.query.id
        var direction = req.query.direction[0]; //either u or d
        var oldPos = compData[id].sort;
        var otherId = "";

        if (!id || !direction) {
            res.end('');
        }

        var parent = compData[id].parent;

        fixChildsSort(parent, userID);

        var beforeId = '';
        var afterId = '';

        //get all siblings
        var siblings = [];
        for (var key in compData) {
            if (compData.hasOwnProperty(key)) {
                if (parent === compData[key].parent) {
                    //log("found: " , compData[key].name,  compData[key].sort, parent , compData[key].parent);
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
        saveAllJSON(true, userID, []);

        var newPos = compData[id].sort;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ "newPos": newPos, "oldPos": oldPos, "otherId": otherId }));

    }

});

router.get("/getBackup", function (req, res) {
    res.writeHead(200, { "Content-Type": "application/json" });
    var userID = req.query.userID
    var id = req.query.id
    var idx = req.query.idx

    let backup = {}
    if (!compDataObj[userID]) {
        log("getBackup error: compDataObj does not have property userID")
        res.end("getBackup error: compDataObj does not have property userID")
    } else {
        backup = compDataObj[userID][id].backups[idx]

        res.end(JSON.stringify(backup))
    }

})

router.get("/getPromoted", function (req, res) {
    res.writeHead(200, { "Content-Type": "application/json" });
    var userID = req.query.userID

    function findProm(compData, retArr) {
        for (var key in compData) {
            if (compData[key].hasOwnProperty("variables")) {
                if (compData[key].variables["promoted"]) {
                    if (compData[key].variables["promoted"].value.trim() === "true") {

                        let icon = compData[key].variables["icon"] ? compData[key].variables["icon"].value.trim() : ""
                        let onclickJob = compData[key].variables["onclickJob"] ? compData[key].variables["onclickJob"].value.trim() : ""
                        let text = compData[key].text ? compData[key].text : ""

                        retArr.push({ "id": compData[key].id, "icon": icon, "text": text, "onclickJob": onclickJob })
                    }
                }

            }
        }
    }
    var retArr = []
    if (!compDataObj[userID]) {
        fs.readFile(__dirname + '/compData/compData.' + userID + '.json', (err, data) => {
            if (!err && data) {

                compDataObj[userID] = JSON.parse(data)
                let compData = compDataObj[userID]

                findProm(compData, retArr)

                res.end(JSON.stringify(retArr));

            } else {
                log("loadSavedComps error: compDataObj does not have property userID")
            }
        })
    } else {
        let compData = compDataObj[userID]
        findProm(compData, retArr)

        res.end(JSON.stringify(retArr));
    }

})

router.get("/SetAttrib", function (req, res) {

    var userID = req.query.userID ? req.query.userID : ""
    var id = req.query.id ? req.query.id : ""
    var attrib = req.query.attrib ? req.query.attrib : ""
    var value = req.query.value ? req.query.value : ""

    if (!compDataObj[userID] || userID == 0) {
        log("SetAttrib error: compDataObj does not have property userID")
        res.end("SetAttrib error: compDataObj does not have property userID")
    } else {

        if (attrib == "enabled") {
            compDataObj[userID][id].enabled = value
        }

        saveAllJSON(false, userID, []);

        res.end("");
    }

});

function fixChildsSort(parentId, userID) {
    if (!compDataObj[userID]) {
        log("fixChildsSort error: compDataObj does not have property userID")
        res.end("fixChildsSort error: compDataObj does not have property userID")
    } else {

        var compData = compDataObj[userID]

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
}

var connections = []

//Create and register connection or lookup connection
function getConn(conOptions, callback) {
    let token = conOptions.token
    let userID = conOptions.userID
    let name = conOptions.name
    let ids = conOptions.ids
    let ws = conOptions.ws
    let key = conOptions.key
    let props = conOptions.props
    let conn = false
    connections.forEach(function (value, index, array) {
        if (value.token === token) {
            conn = connections[index]
            log("Found connection for " + name)
        }
    });

    //clear results from all components to be run
    if (compDataObj[userID]) {
        for (idx in ids) {
            compDataObj[userID][ids[idx]].results = []
        }
    }

    if (conn) {
        conn.key = key
        if (ids) {
            const req = { "id": ids[0], "varName": "", "varVal": "", "props": props }
            conn.reqs.push(req)
            ids.shift()
            for (idx in ids) {
                conn.reqs.push({ "id": ids[idx], "varName": "", "varVal": "", "props": "" })
            }
        }
        callback(conn)
    } else {
        log("Add connection to " + connections.length + " for " + name)
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
                    log('SSH - Connection Error for ' + name + ': ' + err);
                    let mess = JSON.stringify({
                        "message": "\r\n# Error: Connection error\r\n" + err + "\r\n",
                        "status": "down"
                    })
                    ws.send(mess)
                    connections.every((element, index, array) => {
                        if (element.token === token) {
                            log("connection error - delete connections[" + index + "] for " + element.name)
                            // delete connections[index]
                            connections.splice(index, 1)
                            return false;
                        }
                        return true;
                    });
                });

                //connection end event.
                c.on('end', function () {
                    log('SSH - Connection ended');
                    let mess = JSON.stringify({
                        "message": "\r\n# SSH connection ended\r\n",
                        "status": "down"
                    })
                    ws.send(mess)
                    connections.every((element, index, array) => {
                        if (element.token === token) {
                            log("connection end - delete connections[" + index + "] for " + element.name)
                            // delete connections[index]
                            connections.splice(index, 1)
                            return false;
                        }
                        return true;
                    });
                });

                //connection ready event. 
                c.on('ready', function () {
                    c.shell(function (err, stream) {
                        let token = generateUUID()
                        let conObj = { "err": err, "conn": c, "stream": stream, "token": token, "userID": userID, "key": key, "ws": ws, "name": name, "reqs": [{ "id": ids[0], "varName": "", "varVal": "", "props": props }] }

                        ids.shift()
                        for (idx in ids) {
                            conObj.reqs.push({ "id": ids[idx], "varName": "", "varVal": "", "props": "" })
                        }

                        connections.push(conObj)

                        stream.token = token
                        streamEvents(conObj)
                        let mess = JSON.stringify({
                            "status": "up"
                        })
                        ws.send(mess)
                        stream.write('stty cols 200' + '\n' + 'PS1="[ceStack]$PS1"' + '\n'); //insert [ceStack] into the current prompt

                        if (!compDataObj[userID]) {
                            fs.readFile(__dirname + '/compData/compData.' + userID + '.json', (err, data) => {
                                if (!err && data) {
                                    compDataObj[userID] = JSON.parse(data)
                                    callback(conObj)
                                } else {
                                    callback(conObj)
                                }
                            })
                        } else {
                            callback(conObj)
                        }
                    })
                });
            } catch (error) {
                log('SSH - Connection Error for ' + name + ': ' + error);
                let mess = JSON.stringify({
                    "message": "# Error: Connection error\r\n" + error + "\r\n",
                    "status": "down"
                })
                ws.send(mess)
            }
        }
    }
}

function jump(newHost, conn) {

    var currentUser = conn.conn._chanMgr._client.config.username
    if (newHost.includes("@")) {
        currentUser = newHost.split("@")[0]
        newHost = newHost.split("@")[1]
    }
    log('Jump to: ' + currentUser+"@"+newHost + " for " + conn.name);
    conn.jStream = true
    const jumpConn = new Client()

    // let host=conn.conn._chanMgr._client.config.host
    let privKey = conn.conn._chanMgr._client.config.privateKey

    const destinationSSH = {
        host: newHost,
        port: 22,
        username: currentUser,
        privateKey: privKey
    }

    const forwardConfig = {
        srcHost: 'localhost', // source host
        srcPort: 8000 + randomIntFromInterval(700, 999), // source port
        dstHost: destinationSSH.host, // destination host
        dstPort: destinationSSH.port // destination port
    };
    // echo "jump:root@hnl-rc01.cloud.cybera.ca"
    conn.conn.forwardOut(forwardConfig.srcHost, forwardConfig.srcPort, forwardConfig.dstHost, forwardConfig.dstPort, (err, fwdStream) => {
        if (err) {
            log('FIRST :: forwardOut error: for ' + conn.name + ": " + err.message);
            let mess = JSON.stringify({
                "message": "\r\n# Jump error: " + err.message
            })
            conn.ws.send(mess)
            delete conn.jStream
            conn.stream.write('\n')
        } else {
            jumpConn.connect({
                sock: fwdStream,
                username: destinationSSH.username,
                privateKey: destinationSSH.privateKey,
                readyTimeout: 5000
            });
        }
        jumpConn.on('ready', function () {
            jumpConn.shell(function (err, stream) {
                let ws = conn.ws
                conn.jConn = jumpConn
                conn.jStream = stream
                jumpEvents(conn)
                conn.jStream.write('stty cols 200' + '\n' + 'PS1="[ceStack]$PS1"' + '\n'); //insert [ceStack] into the current prompt
            })
        });
        jumpConn.on('error', function (err) {
            log("Error connecting to jump server: " + forwardConfig.dstHost);
            let mess = JSON.stringify({
                "message": "\r\nError connecting to jump server: " + forwardConfig.dstHost + "\r\n"
            })
            conn.ws.send(mess)
        });
        jumpConn.on('end', function () {
            log('SSH - Jump connection ended');
            let mess = JSON.stringify({
                "message": "\r\n# SSH jump connection closed\r\n"
            })
            conn.ws.send(mess)
            delete conn.jConn

            conn.stream.write('\n')
        });
    });

}

function jumpEvents(conn) {
    let stream = conn.jStream

    stream.on('data', function (data) {

        processStreamData(conn, data)

    });

    stream.on('close', function (code, signal) {
        var dsString = new Date().toISOString(); //date stamp
        log('Jump stream close: ' + dsString);

        let mess = JSON.stringify({
            "message": "\r\n# SSH Jump stream closed\r\n"
        })
        conn.ws.send(mess)
        delete conn.jStream
        conn.jConn.end()

    });

    stream.stderr.on('data', function (data) {
        var dsString = new Date().toISOString(); //date stamp
        log('Jump stream stderr: ' + dsString + " for " + conn.name);
        log(data.toString())

        let mess = JSON.stringify({
            "message": "\r\n# SSH Jump stream stderr\r\n"
        })
        conn.ws.send(mess)
        delete conn.jStream
        conn.jConn.end()
    });

}

function streamEvents(conn) {
    let stream = conn.stream
    let ws = conn.ws

    stream.on('data', function (data) {
        if (!conn.jStream) {
            processStreamData(conn, data)
        }
    });

    stream.on('close', function (code, signal) {
        var dsString = new Date().toISOString(); //date stamp
        log('Stream close: ' + dsString);
        let token = this.token

        let mess = JSON.stringify({
            "message": "\r\n# SSH Stream closed\r\n",
            "status": "down"
        })
        ws.send(mess)

        connections.every((element, index, array) => {
            if (element.token === token) {
                log("stream close - delete connections[" + index + "] for " + element.name)
                // delete connections[index]
                connections.splice(index, 1)
                return false;
            }
            return true;
        });
    });

    stream.stderr.on('data', function (data) {
        log('STDERR: ' + data);
        let token = this.token

        let mess = JSON.stringify({
            "message": "# SSH Stream Error\r\n" + data,
            "status": "down"
        })
        ws.send(mess)
        connections.every((element, index, array) => {
            if (element.token === token) {
                log("stream.stderr - delete connections[" + index + "] for " + element.name)
                // delete connections[index]
                connections.splice(index, 1)

                return false;
            }
            return true;
        });
    });
}

function processStreamData(conn, data) {
    var userID = conn.userID
    var data = data.toString()
    const ws = conn.ws

    let stream
    if (conn.jStream) {
        stream = conn.jStream
    } else {
        stream = conn.stream
    }

    var compData

    if (!compDataObj[userID]) {
        compData = compDataObj["0"]
    } else {
        compData = compDataObj[userID]
    }
    let prompt = "[ceStack]"

    let mess = JSON.stringify({
        "message": data,
        "status": "up"
    })
    ws.send(mess)
    // log("data: " + data.toString())

    let lines = data.split("\n")
    let lastLine = lines[lines.length - 1]


    if (lines.some(substr => substr.startsWith('jump:'))) {
        if (!conn.jStream) {
            let remainder = ""
            let found = false

            lines = lines.filter(s => {
                if (s.startsWith('jump:')) {

                    let dataParts = s.split(":")
                    dataParts.shift()
                    remainder = dataParts.join(":").trim()
                    if (remainder.split(" ").length == 1) { //remainder should be host/ip. Shoud not contain spaces
                        found = true
                    } else {
                        let mess = JSON.stringify({
                            "message": "Jump cancelled. Host malformed (" + remainder + ")."
                        })
                        ws.send(mess)
                    }

                }
                return found
            });
            if (found) {
                jump(remainder, conn)
            }
        }
    }

    if (lines.some(substr => substr.startsWith('var:'))) {

        let found = false
        lines = lines.filter(s => {
            if (s.startsWith('var:')) {
                found = true
            }
            return found
        });

        let dataParts = lines.join("\n").split(":")

        log("detected var: " + dataParts[1] + " for " + conn.name)

        if (conn.reqs.length > 0 && dataParts.length > 2) {
            let varName = dataParts[1] ? dataParts[1] : ""
            conn.reqs[0].varName = varName
            dataParts.shift(); dataParts.shift()
            let remainder = dataParts.join(":")
            conn.reqs[0].varVal = remainder
        }
    } else if (conn.reqs.length > 0 && conn.reqs[0].varName !== "") {
        conn.reqs[0].varVal = (conn.reqs[0].varVal + data.toString()).substring(0, 5000000)

        // log("no var: " + data)
    }

    if (lastLine.includes(prompt)) { //if last line of data has prompt at beginning then send next line(s) of script
        // log("prompt " + lastLine)
        conn.atPrompt = true

        if (conn.reqs.length > 0) {
            let props = conn.reqs[0].props ? conn.reqs[0].props : ""
            let ids = conn.reqs[0].id

            if (conn.reqs[0].varName !== "") {
                const varName = conn.reqs[0].varName
                const varVal = conn.reqs[0].varVal.split(prompt)[0].trim()
                mess = JSON.stringify(
                    {
                        "varName": varName,
                        "varVal": varVal,
                        "props": props,
                        "compVars": compData[ids].variables
                    }
                )
                ws.send(mess)

                if (!compData[ids].results) {
                    compData[ids].results = []
                }

                compData[ids].results.push({ [varName]: varVal })

                conn.reqs[0].varName = ""
                conn.reqs[0].varVal = ""
            }
            let ind = conn.index
            // log("found conn", ids[0], ind)
            if (compData[ids] && compData[ids].script) {
                let script = compData[ids].script
                let lines = script.split('\n')
                // log("conn.index", conn.index, "lines.length", lines.length)
                if (conn.index < lines.length) {
                    let mess = JSON.stringify({
                        "busy": "true"
                    })
                    ws.send(mess)

                    let command = replaceVar(lines[ind], compData[ids], props)

                    stream.write(command + '\n');
                    // log("sent: " + command)
                    conn.index++
                    ind = conn.index
                    while (lines[ind] && lines[ind].substring(0, 1) === '-') {
                        command = replaceVar(lines[ind].substring(1), compData[ids], props)
                        stream.write(command + '\n');

                        conn.index++
                        ind = conn.index
                    }
                } else {
                    conn.reqs.shift()
                    // log("conn.reqs.shift()")
                    conn.index = 0
                    stream.write('\n');
                    let mess = JSON.stringify({
                        "busy": "false"
                    })
                    ws.send(mess)
                }
            } else {
                conn.reqs.shift()
            }
        }
    } else {
        conn.atPrompt = false
        // log("no prompt " + lastLine)
    }
}

function replaceVar(commandStr, job, props) { // find and replace inserted command vars eg. {{c.mVar4}}

    const items = commandStr.split(new RegExp('{{', 'g'));
    items.forEach(function (item) {
        item = item.substr(0, item.indexOf('}}'));

        if (item.length > 2 && item.length < 32 && item.substr(0, 2) === 'c.') {
            var targetVarName = item.substr(2);
            var pid = job.parent;
            var repStr = "{{c." + targetVarName + "}}";
            if (job.variables[targetVarName]) {
                var val = ""
                if (props && props.hasOwnProperty(targetVarName)) {
                    val = props[targetVarName];
                } else {
                    val = job.variables[targetVarName].value;
                }

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
            log("Error: Component Variable not found: " + item + '\n');
            // message("Error: Component Variable not found: " + item + '\n');
            // flushMessQueue();
            // sshSuccess = false;
            // stream.close();
            return ('');
        }
    }
    return (commandStr);
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

router.get("/newUser", function (req, res) {
    var userID = req.query.userID;
    if (!compDataObj[userID]) {
        log("newUser error: compDataObj does not have property userID")
        res.end("newUser error: compDataObj does not have property userID")

    } else {

        const newID = generateUUID()
        compDataObj[newID] = compDataObj["0"]
        compDataObj[newID].created = new Date().toISOString()
        // res.setHeader('userID', userID)
        // res.writeHead(200, { "Content-Type": "application/json" })
        const respJson = { "newID": newID }
        saveAllJSON(false, newID, [])
        res.end(JSON.stringify(respJson))
    }
});

// Function to save all component data for a specified user. Data will also backedup if backup = true
function saveAllJSON(backup, userID, ids) {
    //log("saving");

    var compData
    if (!compDataObj[userID]) {
        log("saveAllJSON error: compDataObj does not have property userID")
        res.end("saveAllJSON error: compDataObj does not have property userID")

    } else {
        compData = compDataObj[userID]

        if (backup) {
            for (idx in ids) {
                id = ids[idx]
                if (compData.hasOwnProperty(id)) {
                    const data = { "text": compData[id].text, "description": compData[id].description, "script": compData[id].script, "variables": compData[id].variables }
                    if (!compData[id].backups) { compData[id].backups = [] }
                    compData[id].backups.unshift({ ds: new Date().toISOString(), data })
                    compData[id].backups = compData[id].backups.slice(0, 10)
                }
            }
        }


        fs.writeFile(__dirname + '/compData/compData.' + userID + '.json', JSON.stringify(compData), function (err) {
            if (err) {
                log('There has been an error saving your component data json.');
                log(err.message)
                return;
            } else if (backup) {
                log("backup");
                var dsString = new Date().toISOString()
                var fds = dsString.replace(/_/g, '-').replace(/T/, '-').replace(/:/g, '-').replace(/\..+/, '')
                const fname = 'compData' + fds + '.' + userID + '.json'
                fs.writeFile(__dirname + "/backup/" + fname, JSON.stringify(compData), function (err) {
                    if (err) {
                        log('There has been an error saving your json: /backup/' + fname);
                        log(err.message);
                        return;
                    } else {
                        var x = 1;
                        fs.readdir(__dirname + "/backup/", function (err, files) { // delete older backups files
                            if (err) {
                                log("Error reading " + __dirname + "/backup/ dir\n" + err)
                            } else {
                                files.forEach(function (mFile) {
                                    if (fs.statSync(__dirname + "/backup/" + mFile).isFile()) {
                                        if ((x + 20) < files.length) {
                                            //log("removing"  + __dirname + "/backup/" + mFile )
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
}

//bodyParser must be below proxy
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

app.use("/", router);

app.use("*", function (req, res) {
    res.status(404).sendFile(__dirname + "/404.html");
});

// http.createServer(app).listen('80');
// log("Express server listening on port 80");
// steal certs from [ root@jira /etc/ssl/certs ]
var secureServer = https.createServer({
    key: fs.readFileSync('/home/ubuntu/.ssh/privkey.pem'),
    cert: fs.readFileSync('/home/ubuntu/.ssh/fullchain.pem'),
    rejectUnauthorized: false
}, app).listen('8443', function () {
    log("Secure Express server listening on port 8443");
});

var wsserver = new WebSocket.Server({ server: secureServer });

wsserver.on('connection', function connection(ws) {

    function processMessage(conn) {

        let mess = ""

        var compData
        if (compDataObj[conn.userID]) {
            compData = compDataObj[conn.userID]
        } else {
            compData = compDataObj["0"]
        }

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
            log("Start connection for " + conn.name)
            ws.send(mess)

            if (conn.key) {
                let key = conn.key
                if (conn.jStream && conn.jConn) {
                    conn.jStream.write(key)
                } else {
                    conn.stream.write(key)
                }
            } else if (conn.reqs[0].id && compData[conn.reqs[0].id].script && conn.atPrompt) {
                conn.index = 0
                if (conn.jStream && conn.jConn) {
                    conn.jStream.write('\n')
                } else {
                    conn.stream.write('\n')
                }
            } else if (conn.reqs[0].id) {
                conn.index = 0
                if (conn.jStream && conn.jConn) {
                    conn.jStream.write('\n')
                } else {
                    conn.stream.write('\n')
                }
            } else {
                // log("processMessage: Was not a key or a run ids req.")
                if (conn.jStream && conn.jConn) {
                    conn.jStream.write('\n')
                } else {
                    conn.stream.write('\n')
                }

            }

        }
    }

    ws.on('message', function (data, isBinary) {
        var dataObj
        try {
            dataObj = JSON.parse(data.toString())
        } catch (error) {
            console.error(error)
            return;
        }

        conOptions = {
            "host": dataObj.settingsHostName,
            "port": '22',
            "name": dataObj.settingsYourName,
            "username": dataObj.settingsLoginName,
            "privateKey": dataObj.settingsKey,
            "token": dataObj.token,
            "userID": dataObj.userID,
            "ids": dataObj.ids,
            "ws": ws,
            "key": dataObj.key,
            "props": dataObj.props
        }

        if (conOptions.ids && conOptions.ids.length > 0) {
            conOptions.ids = SortIDsHy(conOptions.userID, conOptions.ids)
            removeDisabledAndDescendants(conOptions.userID, conOptions.ids)
            if (conOptions.ids && conOptions.ids.length == 0) {
                let mess = JSON.stringify({
                    "message": "No enabled components to be run"
                })
                ws.send(mess)
            }

        }

        getConn(conOptions, processMessage)
    });

    ws.addEventListener('close', function (event) {
        log('ws disconnected');
        connections.every((element, index, array) => {
            if (element.ws === ws) {
                log("ws close - delete connections[" + index + "] for " + element.name)
                // delete connections[index]
                connections.splice(index, 1)
                return false;
            }
            return true;
        });
    });

});

function log(line) {
    console.log(line)
    const dt = new Date().toISOString().replace(/T/, '_').replace(/:/g, '-')
    fs.appendFile( "dsStack_access.log", dt + " - " + line+"\n", function(){

    } )
}

function randomIntFromInterval(min, max) { // min and max included 
    return Math.floor(Math.random() * (max - min + 1) + min)
}

//Recursive functipn to update specified array with ids of all descendants of a specified component
// Provide userID, id of component, results array to update, starting depth (0)
function findAllDescendants(userID, id, results, depth) {
    if (depth < 100) {
        compData = compDataObj[userID] ? compDataObj[userID] : []
        for (d in compData) {
            if (compData[d].parent == id) {
                results.push(d)
                findAllDescendants(userID, d, results, depth + 1)
            }
        }
    } else {
        log("Depth violation 'findAllChildren' 100")
    }
}

//Function to remove disabled ids and their decendants from an array of ids
function removeDisabledAndDescendants(userID, idArray) {

    compData = compDataObj[userID] ? compDataObj[userID] : []
    let disabledArr = []

    //Build array of ids that are disabled and their decendants
    for (idx in idArray) {
        if (compData[idArray[idx]]) {
            if (compData[idArray[idx]].enabled && compData[idArray[idx]].enabled !== "true" && !disabledArr.includes(idArray[idx])) {
                disabledArr.push(idArray[idx])
                findAllDescendants(userID, idArray[idx], disabledArr, 0)
            }
        }
    }
    // remove the disabled ids from the array of ids to be run
    for (idx in disabledArr) {
        const index = idArray.indexOf(disabledArr[idx]);
        if (index > -1) { // only splice array when item is found
            idArray.splice(index, 1); // 2nd parameter means remove one item only
        }
    }
}

function SortIDsHy(userID, IDsArr) {

    var compData
    if (compDataObj[userID]) {
        compData = compDataObj[userID]
    } else {
        compData = compDataObj["0"]
    }

    function hierarchySortFunc(a, b) {
        return a.sort - b.sort
        // return a.sort.localeCompare(b.sort, 'en', { numeric: true })
    }

    function hierarhySort(hashArr, key, result) {

        if (hashArr[key] == undefined) return;
        var arr = hashArr[key].sort(hierarchySortFunc);
        for (var i = 0; i < arr.length; i++) {
            result.push(arr[i]);
            hierarhySort(hashArr, arr[i].id, result);
        }

        return result;
    }
    let arr = []

    for (idx in IDsArr) {
        if (compData[IDsArr[idx]]) {
            arr.push({ "id": IDsArr[idx], "parent": compData[IDsArr[idx]].parent, "sort": compData[IDsArr[idx]].sort })
        }

    }
    var hashArr = {};

    for (var i = 0; i < arr.length; i++) {
        if (hashArr[arr[i].parent] == undefined) hashArr[arr[i].parent] = [];
        hashArr[arr[i].parent].push(arr[i]);
    }

    const result = hierarhySort(hashArr, Object.keys(hashArr)[0], []);

    const ids = []
    for (idx in result) {
        ids.push(result[idx].id)
    }
    return ids

}
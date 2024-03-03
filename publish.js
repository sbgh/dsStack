
var fs = require('fs');
var results = []
fs.readdir(__dirname + "/compData/", function (err, files) {
    if (err) {
        console.log("Error reading " + __dirname + "/compData/ dir\n" + err)
    } else {
        files.forEach(function (mFile) {
            if (fs.statSync(__dirname + "/compData/" + mFile).isFile()) {
                processFile(mFile)
            }
        })
    }
})

function processFile(mFile) {
    const fileData = fs.readFileSync(__dirname + '/compData/' + mFile)
    const fileDataObj = JSON.parse(fileData)
    var found = false

    console.log(mFile)

    for (var key in fileDataObj) {
        let rowdata = fileDataObj[key]

        if (isPublic(rowdata)) {
            if (!results.includes(key)) {
                results.push(key)
                console.log(key)
                found = true
                findAllDescendants(fileDataObj, key, results, 0)
            }
        }
    }

    if (found == true) {
        console.log("writing")
        writeData = {}
        for (idx in results) {
            var newRowdata = {}
            let id = results[idx]
            newRowdata.text = fileDataObj[id].text
            newRowdata.script = fileDataObj[id].script
            newRowdata.description = fileDataObj[id].description
            newRowdata.parent = fileDataObj[id].parent
            newRowdata.sort = fileDataObj[id].sort
            newRowdata.hist = fileDataObj[id].hist
            newRowdata.enabled = fileDataObj[id].enabled || "false"

            newRowdata.variables = {}

            for (var ind in fileDataObj[id].variables) {
                if (fileDataObj[id].variables.hasOwnProperty(ind)) {
                    if (!fileDataObj[id].variables[ind].private) {
                
                        newRowdata.variables[ind] = fileDataObj[id].variables[ind]
                    } else {
                        newRowdata.variables[ind] = JSON.parse(JSON.stringify(fileDataObj[id].variables[ind]));
                        newRowdata.variables[ind].value = "";


                        console.log(ind+" - "+JSON.stringify(fileDataObj[id]))
                    }
                }
            }

            writeData[id] = newRowdata
        }

        fs.writeFile(__dirname + '/compData.json', JSON.stringify(writeData), function (err) {
            if (err) {
                console.log('There has been an error saving your component data json.');
                console.log(err.message)
                return;
            }
        })
    }
}

function isPublic(rowdata) {
    for (var ind in rowdata.variables) {
        if (rowdata.variables.hasOwnProperty(ind)) {
            if (ind === "public" && rowdata.variables[ind].value === "true") {
                console.log("pub " + rowdata.text)
                return true
            }
        }
    }
    return false
}

function findAllDescendants(fileDataObj, id, results, depth) {
    if (depth < 100) {
        for (d in fileDataObj) {
            if (fileDataObj[d].parent == id) {
                if (!results.includes(d)) { results.push(d); console.log(d) }
                findAllDescendants(fileDataObj, d, results, depth + 1)
            }
        }
    } else {
        log("Depth violation 'findAllDescendants' 100")
    }
}


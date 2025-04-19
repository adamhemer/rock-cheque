require('dotenv').config();

const express = require('express');
const app = express();
const cors = require('cors');
const port = 8000;
const { ControlBoard } = require('./ControlBoard');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const { Category, Question } = require('./CategoryQuestion');
const { Player } = require('./Player');
const clc = require("cli-color");
const fs = require("fs");
const { match } = require('assert');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded());
app.use(express.static(__dirname + "/public"));


var host_ip;
var control_board_ip;
var display_ip;

var listener;

const debugAuth = true;

function getFormattedDate() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

const serviceAccountAuth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: Buffer.from(process.env.GOOGLE_PRIVATE_KEY , 'base64').toString('ascii'),
    scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
    ],
});


const document = new GoogleSpreadsheet('1PhDNYLUodoj0HWHkgYcoxYkg7U2j2d1WauuXQJ1QJs4', serviceAccountAuth)
var sheet;

const controller = new ControlBoard("COM4", 115200);
controller.reset();

let eventLog = [];

function log(arg, colour) {
    if (colour) {
        console.log(colour(arg));
        eventLog.push(colour(arg));
    } else {
        console.log(arg)
        eventLog.push(arg);
    }
}

const STATES = {
    SETUP: 0,       // Asigning players to buzzers, choosing colours, etc
    DEMO: 1,        // Let players try out the remotes
    SELECTION: 2,   // On the category board
    WAITING: 3,     // Question shown but players cant buzz yet
    ARMED: 4,       // Players can buzz in
    BUZZED: 5,      // A player has buzzed in
    ANSWERED: 6,    // The question has been answered correctly, show answer
    TIEBREAK: 7,    // Extra question for tiebreaking
    GAMEOVER: 8     // All questions are complete, show final scores
}

var buzzTime = 0;

const MEDIA_STATES = {
    INITIAL: 0,
    PLAY_QUESTION: 1,
    PLAY_ANSWER: 2,
}

// SETUP

let newGameID = getFormattedDate()
var gameState = {
    gameID: newGameID,
    dataPath:  newGameID + ".json",
    state: STATES.SETUP,
    boardData: [],
    players: []
};

var mediaState = MEDIA_STATES.INITIAL;


// For testing frontend
// gameState.players.push(new Player("Adam", 0, "FFAA00"));
// gameState.players.push(new Player("Dylan", 1, "FF00FF"));
// gameState.players.push(new Player("Koni", 3, "00FFAA"));
// gameState.players.push(new Player("Hayley", 2, "AAFF00"));
// gameState.players.push(new Player("Beth", 7, "0000FF"));
// gameState.players.push(new Player("Callum", 5, "00AAFF"));
// gameState.players.push(new Player("James", 4, "964B00"));
// gameState.players.push(new Player("Leah", 6, "FFC0CB"));


function searchFiles(callback) {
    fs.readdir(".", (err, files) => {
        if (err) {
            console.error('Error reading directory', err);
            callback(-1); // Can't read directory
        }

        var matchedFiles = files.filter(file => /^\d{14}/.test(file));
        matchedFiles = matchedFiles.map(file => new Object ({ valid: true, path: file, playerData: [] }));
        if (matchedFiles.length > 0) {
            for (let i = 0; i < matchedFiles.length; i++) {
                // console.log(i);
                const f = matchedFiles[i].path;
                let data = fs.readFileSync(f, 'utf8');

                const json = JSON.parse(data);
                // console.log(json);
                if (!json || !json.players) {
                    log('Invalid file: ' + f);
                    matchedFiles[i].valid = false;
                    continue;
                }
                json.players.forEach(player => {
                    if (player.name == null || player.buzzer == null || player.colour == null || player.points == null ) {
                        log('Invalid file: ' + f);
                        matchedFiles[i].valid = false;
                    }
                    console.log(player)
                    matchedFiles[i].playerData.push(player);
                });

            }
            matchedFiles = matchedFiles.filter(file => file.valid);
            if (matchedFiles.length > 0) {
                console.log('Matched files with valid player data:', matchedFiles.map(file => file.path));
                callback(matchedFiles);
            } else {
                console.log('No files matched the format');
                callback(-2); // No valid files found
            }
        } else {
            console.log('No files matched the format');
            callback(-2); // No valid files found
        }
        // log('Loading players from ' + matchedFiles.slice(-1)[0].path);
        // loadPlayers(matchedFiles.slice(-1)[0].path);
    });
}

function savePlayers(path) {
    const jsonString = JSON.stringify(gameState);
    // const jsonString = JSON.stringify(gameState.players, null, 2);

    fs.writeFile(path, jsonString, (err) => {
        if (err) {
            log('Error writing to file' + err);
        } else {
            log('File written successfully');
        }
    });
}

function updateControllerColours() {
    if (gameState.players.length > 0) {

        gameState.players.forEach(player => {
            controller.setColour(player.buzzer, player.colour);
        });
    } else {
        for (let i = 0; i < 8; i++) {
            controller.setColour(i, "0000FF");
        }
    }
}

function loadPlayers(path) {
    fs.readFile(path, 'utf8', (err, data) => {
        if (err) {
            log('Error writing to file' + err);
        } else {
            gameState = JSON.parse(data);
            // gameState.players = JSON.parse(data);
            log('File read successfully');
            console.log(gameState);
            updateControllerColours();
        }
    });
}


async function loadSheet() {

    await document.loadInfo();
    // log(document.title);

    sheet = document.sheetsByIndex[0];

    const { title, lastColumnLetter, rowCount } = sheet;

    await sheet.loadCells(`A1:${lastColumnLetter}${rowCount}`);

    // log(Object.keys(sheet));
    // log(sheet._rawProperties.gridProperties.columnCount);

    const columnCount = sheet._rawProperties.gridProperties.columnCount;

    // ================ SCAN AND PARSE CATEGORIES AND QUESTIONS ================
    // Identify categories
    for (let i = 0; i < columnCount; i++) {
        const cell = sheet.getCell(0, i);
        if (cell.value !== null) {
            // New category found!
            let newCategory = new Category(cell.value);

            for (let j = 0; j < rowCount - 2; j++) {

                let type = sheet.getCell(2 + j, i).value;

                if (type === Question.TYPES.TEXT) {
                    newCategory.questions.push(new Question.QuestionBuilder()
                        .pointReward(sheet.getCell(2 + j, i + 1).value)
                        .withText(sheet.getCell(2 + j, i + 2).value)
                        .withTextAnswer(sheet.getCell(2 + j, i + 3).value)
                        .build()
                    )
                } else if (type === Question.TYPES.IMAGE) {
                    
                    let sources = sheet.getCell(2 + j, i + 4).value.split(', ');
                    let questionImage = sources[0];             // First value
                    let answerImage = sources.slice(-1)[0];     // Last value (will be same as first for n=1)

                    newCategory.questions.push(new Question.QuestionBuilder()
                        .pointReward(sheet.getCell(2 + j, i + 1).value)
                        .withText(sheet.getCell(2 + j, i + 2).value)
                        .withTextAnswer(sheet.getCell(2 + j, i + 3).value)
                        .withImage(questionImage)
                        .withImageAnswer(answerImage)
                        .build()
                    )

                } else if (type === Question.TYPES.VIDEO) {
                    
                    let parameters = sheet.getCell(2 + j, i + 5).value.split(', ');
                    let startAt = parameters[0];                // Start video at this time
                    let pauseAt = parameters[1];                // Pause video here for question

                    newCategory.questions.push(new Question.QuestionBuilder()
                        .pointReward(sheet.getCell(2 + j, i + 1).value)
                        .withText(sheet.getCell(2 + j, i + 2).value)
                        .withTextAnswer(sheet.getCell(2 + j, i + 3).value)
                        .withVideo(sheet.getCell(2 + j, i + 4).value)
                        .startAt(startAt)
                        .pauseAt(pauseAt)
                        .build()
                    )

                } else if (type === Question.TYPES.AUDIO) {
                    
                    let parameters = sheet.getCell(2 + j, i + 5).value.split(', ');
                    let startAt = parameters[0];                // Start audio at this time
                    let pauseAt = parameters[1];                // Pause audio here for question

                    newCategory.questions.push(new Question.QuestionBuilder()
                        .pointReward(sheet.getCell(2 + j, i + 1).value)
                        .withText(sheet.getCell(2 + j, i + 2).value)
                        .withTextAnswer(sheet.getCell(2 + j, i + 3).value)
                        .withAudio(sheet.getCell(2 + j, i + 4).value)
                        .startAt(startAt)
                        .pauseAt(pauseAt)
                        .build()
                    )

                } else {
                    // log("INVALID TYPE");
                }
            }
            
            // JUST FOR TESTING, HAVE SOME QUESTIONS COMPLETE
            // for (let i = 0; i < newCategory.questions.length; i++) {
            //     newCategory.questions[i].complete = !(i % 3);
            // }


            gameState.boardData.push(newCategory);
        }
    }
}

async function startServer() {

    // searchFiles();

    await loadSheet();

    listener = app.listen(port, () => {
        log("Server started.", clc.green);
        updateControllerColours();
    });
}


//    -----========================-----
// -----====== CONTROLLER HOOKS ======-----
//    -----========================-----

// -------- SETUP --------

controller.onChar('P', (data) => {
    if (gameState.binding) {
        let index = parseInt(data.slice(0, 1)); // Ensure only 1 digit grabbed

        let existing = gameState.players.findIndex(p => p.buzzer === index);
        if (existing >= 0) {
            log(`Overwriting player ${gameState.players[existing].name} with player ${gameState.binding.name} on Buzzer ${index}`, clc.redBright);
            gameState.players[existing] = new Player(gameState.binding.name, index, gameState.binding.colour);
        } else {
            log(`Bound ${gameState.binding.name} to Buzzer ${index}`, clc.magentaBright);
            gameState.players.push(new Player(gameState.binding.name, index, gameState.binding.colour));
        }
        controller.setColour(index, gameState.binding.colour);
        gameState.binding = null;
        savePlayers(gameState.dataPath);
    }
});

// -------- DEMO --------

// -------- SELECTION --------

// -------- WAITING --------



// -------- ARMED --------

controller.onChar('B', (data) => { // Player buzzed in
    if (gameState.state === STATES.ARMED) {
        buzzTime = Date.now();
        let index = parseInt(data.slice(0, 1));
        let player = gameState.players.find(p => p.buzzer === index);

        if (!player || !player.name) {
            log(`Buzzer ${index} pressed but not bound to a player!`, clc.redBright);
            return;
        }

        log(`${player.name} Buzzed!`);
        
        gameState.state = STATES.BUZZED;
        gameState.buzzedPlayer = player;
    } else {
        log(`${player.name} pressed their buzzer`);
    }
});

// -------- BUZZED --------

controller.onChar('L', (data) => {
    lateBy = Date.now() - buzzTime;
    let index = parseInt(data.slice(0, 1));
    let player = gameState.players.find(p => p.buzzer === index);

    if (!player || !player.name) {
        log(`Buzzer ${index} pressed but not bound to a player!`, clc.redBright);
        return;
    }

    log(`${player.name} buzzed ${lateBy}ms late`, clc.redBright);
    // Player too late
});

// -------- ANSWERED --------

// No commands



//    -----========================-----
// -----====== SERVER ENDPOINTS ======-----
//    -----========================-----


app.post("/bind-player", (req, res) => {   // Create new player and set them to be bound to next button press
    if (req.ip === host_ip || debugAuth) {
        
        if (!req.body.name || !req.body.colour) {
            log(clc.redBright("Cannot bind player without name and colour!"))
            res.sendStatus(200);
            return;
        }

        gameState.binding = {
            name: req.body.name,
            colour: req.body.colour
        }

        log(`Binding player ${req.body.name}`, clc.magentaBright);

        res.sendStatus(200);    // OK
    } else {
        res.sendStatus(403);    // Access Forbidden
    }
});


app.get("/", (req, res) => {
    res.sendFile(__dirname + "/views/index.html");
});


app.post("/host", (req, res) => {
    if (!host_ip) {
        // Register the host IP
        host_ip = req.ip
        log(`Host registered to IP ${host_ip}}`, clc.bgGreen)
        res.sendStatus(200);
    } else if (req.ip !== host_ip && !debugAuth) {
        // If a non-host tries the endpoint
        log(`Cannot register host to IP ${req.ip}, host already registered to IP ${host_ip}}`)
        res.sendStatus(403);
    } else {
        // If the host tries the endpoint
        // log(`Host already registered to IP ${host_ip}}`)
        res.sendStatus(200);
    }
});

app.get("/event-log", (req, res) => {
    if (req.ip === host_ip || debugAuth) {
        res.send(eventLog);
    } else {
        log("Illegal access attempy by " + req.ip);
        res.sendStatus(403);    // Access Forbidden
    }
});

app.get("/board-data", (req, res) => {
    if (!display_ip && req.ip !== host_ip) { // Prevent the host from being registered as the display
        // Register the display IP
        display_ip = req.ip
        log(`Display registered to IP ${display_ip}}`, clc.bgGreen)
        res.json(gameState.boardData);
    } else if (req.ip === display_ip || req.ip === host_ip || debugAuth) {
        // Host and Display can access board data
        res.send(gameState.boardData);
    } else {
        log("Illegal access attempy by " + req.ip);
        res.sendStatus(403);    // Access Forbidden
    }
});

app.get("/game-state", (req, res) => {
    if (req.ip === display_ip || req.ip === host_ip || debugAuth) {
        res.json(gameState);
    } else {
        res.sendStatus(403);    // Access Forbidden
    }
});


app.get("/media-state", (req, res) => {
    if (req.ip === display_ip || req.ip === host_ip || debugAuth) {
        res.json(mediaState);
    } else {
        res.sendStatus(403);    // Access Forbidden
    }
});


app.post("/select-question", (req, res) => {
    if (req.ip === host_ip || debugAuth) {
        
        if (gameState.state === STATES.SELECTION && req.body.category && req.body.question) {

            let category = gameState.boardData.find(cat => cat.title === req.body.category);

            if (!category) {
                log("Could not find selected category!", clc.redBright);
                return res.sendStatus(400);
            }

            let question = category.questions.find(qu => qu.title === req.body.question);

            if (!question) {
                log("Could not find selected question!", clc.redBright);
                return res.sendStatus(400);
            }

            gameState.state = STATES.WAITING;
            gameState.activeCategory = category;
            gameState.activeQuestion = question;

            log(`Starting question ${category.title} for ${question.reward}`);

            mediaState = MEDIA_STATES.INITIAL;

            // log(gameState.activeCategory);
            // log(gameState.activeQuestion);
        } else if (gameState.state > STATES.SELECTION) {
            gameState.state = STATES.SELECTION;
            gameState.activeQuestion.complete = true;
            gameState.activeCategory = null;
            gameState.activeQuestion = null;

            log("Question finished.")

            controller.reset();
        }

        res.sendStatus(200);    // OK
    } else {
        res.sendStatus(403);    // Access Forbidden
    }
});

app.post("/modify-points", (req, res) => {
    if (req.ip === host_ip || debugAuth) {
        let player = gameState.players.find(p => p.buzzer === req.body.index);
        player.points += req.body.points;
        log(`Host modified ${player.name}'s points by ${req.body.points} | ${player.points - req.body.points} -> ${player.points}`, clc.redBright);
        res.sendStatus(200);
    } else {
        res.sendStatus(403);    // Access Forbidden
    }
});

app.post("/start-game", (req, res) => {
    if (req.ip === host_ip || debugAuth) {

        gameState.state = STATES.SELECTION;
        gameState.activeCategory = null;
        gameState.activeQuestion = null;

        updateControllerColours();

        res.sendStatus(200);
    } else {
        res.sendStatus(403);    // Access Forbidden
    }
})

app.get("/player-stats", (req, res) => {

});

app.post("/answer-response", (req, res) => {
    if (req.ip === host_ip || debugAuth) {
        if (!gameState.activeQuestion) { res.sendStatus(200); return log("Cannot answer a question when no question is active!"); } 
        if (!gameState.buzzedPlayer) { res.sendStatus(200); return log("Cannot reward player when none is buzzed!", clc.redBright); }

        let correct = req.body.correct;
        let reward = gameState.activeQuestion.reward;

        if (!correct) {
            setTimeout(() => {
                gameState.state = STATES.ARMED;
                controller.reset();
                controller.armBuzzers();
            }, 4000);
            log(`${gameState.buzzedPlayer.name} answered incorrectly and lost ${reward} points`, clc.red)
        } else {
            log(`${gameState.buzzedPlayer.name} answered correctly and gained ${reward} points`, clc.green)
        }

        gameState.buzzedPlayer.points += correct ? reward : -reward;
        gameState.buzzedPlayer = null;
        controller.answer(correct);

        savePlayers(gameState.dataPath);

        res.sendStatus(200);
    } else {
        res.sendStatus(403);    // Access Forbidden
    }
});

app.post("/override-question-state", (req, res) => {
    if (req.ip === host_ip || debugAuth) {
        
        let category = gameState.boardData.find(cat => cat.title === req.body.category);

        if (!category) {
            log("Could not find category to override!", clc.redBright);
            return res.sendStatus(400);
        }

        let question = category.questions.find(qu => qu.title === req.body.question);

        if (!question) {
            log("Could not find question to override!", clc.redBright);
            return res.sendStatus(400);
        }

        question.complete = req.body.complete;

        res.sendStatus(200);
    } else {
        res.sendStatus(403);    // Access Forbidden
    }
});

app.post("/activate-buzzers", (req, res) => {
    if (req.ip === host_ip || debugAuth) {
        log("Buzzers activated!", clc.magentaBright)
        gameState.state = STATES.ARMED;
        controller.armBuzzers();
        if (gameState.activeQuestion.type === Question.TYPES.VIDEO || gameState.activeQuestion.type === Question.TYPES.AUDIO) {
            mediaState = MEDIA_STATES.PLAY_QUESTION;
        }

        res.sendStatus(200);
    } else {
        res.sendStatus(403);    // Access Forbidden
    }
});

app.post("/show-answer", (req, res) => {
    if (req.ip === host_ip || debugAuth) {
        if (!gameState.activeQuestion) { res.sendStatus(200); return log("Cannot show answer when no question is active!", clc.redBright); } 
        log("Showing answer!", clc.magentaBright)
        gameState.state = STATES.ANSWERED;

        if (gameState.activeQuestion.type === Question.TYPES.VIDEO || gameState.activeQuestion.type === Question.TYPES.AUDIO) {
            mediaState = MEDIA_STATES.PLAY_ANSWER;
        }

        res.sendStatus(200);
    } else {
        res.sendStatus(403);    // Access Forbidden
    }
});

app.post("/rewind-media", (req, res) => {
    if (req.ip === host_ip || debugAuth) {
        if (!gameState.activeQuestion) { res.sendStatus(200); return log("Cannot rewind media when no question is active!", clc.redBright); } 
        
        if (gameState.activeQuestion.type === Question.TYPES.VIDEO || gameState.state.activeQuestion.type === Question.TYPES.AUDIO) {
            mediaState = MEDIA_STATES.INITIAL;
            log("Rewinding media.", clc.magentaBright)
        } else {
            return log("Cannot rewind non-media question!", clc.redBright);
        }
        res.sendStatus(200);
    } else {
        res.sendStatus(403);    // Access Forbidden
    }
});

app.get("/read-save-games", (req, res) => {
    if (req.ip === host_ip || debugAuth) {
        searchFiles((searchResult) => {
            if (searchResult === -1) {
                return res.send({ error: "Cannot read save directory." });
            } else if (searchResult === -2) {
                return res.send({ error: "No valid save files found." });
            } else {
                return res.send(searchResult);
            }
        });

    } else {
        res.sendStatus(403);    // Access Forbidden
    }
});

app.post("/save-game", (req, res) => {
    if (req.ip === host_ip || debugAuth) {
        savePlayers(gameState.dataPath);
        res.sendStatus(200);
    } else {
        res.sendStatus(403);    // Access Forbidden
    }
});

app.post("/load-game", (req, res) => {
    if (req.ip === host_ip || debugAuth) {
        if (req.body.gameID === gameState.gameID) {
            log("Game already loaded!", clc.redBright);
        } else {
            loadPlayers(req.body.path);
        }
        res.sendStatus(200);
    } else {
        res.sendStatus(403);    // Access Forbidden
    }
})

app.post("/play-media", (req, res) => {
    if (req.ip === host_ip || debugAuth) {
        if (!gameState.activeQuestion) { res.sendStatus(200); return log("Cannot play media when no question is active!", clc.redBright); } 
        
        if (gameState.activeQuestion.type === Question.TYPES.VIDEO || gameState.state.activeQuestion.type === Question.TYPES.AUDIO) {
            if (mediaState === MEDIA_STATES.INITIAL) {
                if (gameState.state === STATES.ANSWERED) {
                    log("Replaying answer.", clc.magentaBright);
                    mediaState = MEDIA_STATES.PLAY_ANSWER;
                } else {
                    log("Replaying question.", clc.magentaBright);
                    mediaState = MEDIA_STATES.PLAY_QUESTION;
                }
            } else {
                log("Can't play media that hasn't been rewound.");
            }

        } else {
            return log("Cannot play non-media question!", clc.redBright);
        }
        res.sendStatus(200);
    } else {
        res.sendStatus(403);    // Access Forbidden
    }
});

app.post("/buzzer", (req, res) => {
    if (!control_board_ip) {
        control_board_ip = req.ip
        log(`Buzzer control board registered to IP ${control_board_ip}}`)
    }
});

startServer()










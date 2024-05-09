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

app.use(cors());
app.use(express.json());
app.use(express.urlencoded());
app.use(express.static(__dirname + "/public"));


var host_ip;
var control_board_ip;
var display_ip;

var listener;

const debugAuth = true;


const serviceAccountAuth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: Buffer.from(process.env.GOOGLE_PRIVATE_KEY , 'base64').toString('ascii'),
    scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
    ],
});


const document = new GoogleSpreadsheet('1PhDNYLUodoj0HWHkgYcoxYkg7U2j2d1WauuXQJ1QJs4', serviceAccountAuth)
var sheet;



const controller = new ControlBoard("COM3", 115200);
controller.reset();

let eventLog = [];

function log(arg, colour) {
    if (colour) {
        console.log(colour(arg));
    } else {
        console.log(arg)
    }
    eventLog.push(arg);
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


// SETUP



var boardData = [];
var gameState = {
    state: STATES.SELECTION,
    players: []
};


// For testing frontend
gameState.players.push(new Player("Adam", 0, "FFAA00"));
gameState.players.push(new Player("Dylan", 1, "FF00FF"));
gameState.players.push(new Player("Koni", 3, "00FFAA"));
gameState.players.push(new Player("Hayley", 2, "AAFF00"));
gameState.players.push(new Player("Beth", 7, "0000FF"));
gameState.players.push(new Player("Callum", 5, "00AAFF"));
gameState.players.push(new Player("James", 4, "964B00"));
gameState.players.push(new Player("Leah", 6, "FFC0CB"));



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


            boardData.push(newCategory);
        }
    }




    // log(boardData[0]);
    //log(categories[0].questions);



    // categoryAmount = sheet.getCell(0, 0).value;
    // questionAmount = sheet.getCell(1, 0).value;
    // for (let i = 0; i < categoryAmount; i++) {
    //     categoryNames[i] = sheet.getCell(2, 2 + i).value;
    // }
    // for (let i = 0; i < categoryAmount; i++) {
    //     categoryQuestions[i] = [];
    //     categoryAnswers[i] = [];
    //     for (let j = 0; j < questionAmount; j++) {
    //         categoryQuestions[i][j] = sheet.getCell(3 + j, 2 + i).value;
    //         categoryAnswers[i][j] = sheet.getCell(12 + j, 2 + i).value;
    //     }
    // }


}

async function startServer() {

    await loadSheet();

    listener = app.listen(port, () => {
        log("Server started.", clc.green);
    });
}



// controller.onChar('P', (data) => {
//     log("Button pressed on " + data);
// });

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
    }
});

// -------- DEMO --------

// -------- SELECTION --------

// -------- WAITING --------



// -------- ARMED --------

controller.onChar('B', (data) => { // Player buzzed in
    if (gameState.state === STATES.ARMED) {
        let index = parseInt(data.slice(0, 1));
        let player = gameState.players.find(p => p.buzzer === index);
        log(`${player.name} Buzzed!`);
        
        gameState.state = STATES.BUZZED;
        gameState.buzzedPlayer = player;
    }
});

// -------- BUZZED --------

controller.onChar('L', (data) => {
    // Player too late
});

// -------- ANSWERED --------

// No commands


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
        log(`Host registered to IP ${host_ip}}`, bgGreen)
        res.sendStatus(200);
    } else if (req.ip !== host_ip) {
        // If a non-host tries the endpoint
        log(`Cannot register host to IP ${req.ip}, host already registered to IP ${host_ip}}`)
        res.sendStatus(403);
    } else {
        // If the host tries the endpoint
        log(`Host already registered to IP ${host_ip}}`)
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
    if (!display_ip) {
        display_ip = req.ip
        log(`Display registered to IP ${display_ip}}`, clc.bgGreen)
        res.json(boardData);
    } else if (req.ip === display_ip || req.ip === host_ip || debugAuth) {
        res.send(boardData);
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

app.post("/select-question", (req, res) => {
    if (req.ip === host_ip || debugAuth) {
        
        if (gameState.state === STATES.SELECTION) {

            let category = boardData.find(cat => cat.title === req.body.category);

            if (!category) {
                log("Could not find selected category!", redBright);
                return res.sendStatus(400);
            }

            let question = category.questions.find(qu => qu.title === req.body.question);

            if (!question) {
                log("Could not find selected question!", redBright);
                return res.sendStatus(400);
            }

            gameState.state = STATES.WAITING;
            gameState.activeCategory = category;
            gameState.activeQuestion = question;

            log(`Starting question ${category.title} for ${question.reward}`);

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
        log(`Host modified ${player.name}'s points by ${req.body.points} | ${player.points - req.body.points} -> ${player.points}`, redBright);
        res.sendStatus(200);
    } else {
        res.sendStatus(403);    // Access Forbidden
    }
});

app.get("/player-stats", (req, res) => {

});

app.post("/answer-response", (req, res) => {
    if (req.ip === host_ip || debugAuth) {
        if (!gameState.activeQuestion) { res.sendStatus(200); return log("Cannot answer a question when no question is active!"); } 
        if (!gameState.buzzedPlayer) { res.sendStatus(200); return log("Cannot reward player when none is buzzed!", redBright); }

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
        res.sendStatus(200);
    } else {
        res.sendStatus(403);    // Access Forbidden
    }
});

app.post("/show-answer", (req, res) => {
    if (req.ip === host_ip || debugAuth) {
        if (!gameState.activeQuestion) { res.sendStatus(200); return log(clc.redBright("Cannot show answer when no question is active!")); } 
        log("Showing answer!", clc.magentaBright)
        gameState.state = STATES.ANSWERED;
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










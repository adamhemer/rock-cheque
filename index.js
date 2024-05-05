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
// gameState.players.push(new Player("Adam", 0, "FFAA00"));
// gameState.players.push(new Player("Dylan", 1, "FF00FF"));
// gameState.players.push(new Player("Koni", 3, "00FFAA"));
// gameState.players.push(new Player("Hayley", 2, "AAFF00"));
// gameState.players.push(new Player("Beth", 7, "0000FF"));
// gameState.players.push(new Player("Callum", 5, "00AAFF"));
// gameState.players.push(new Player("James", 4, "964B00"));
// gameState.players.push(new Player("Leah", 6, "FFC0CB"));



async function loadSheet() {

    await document.loadInfo();
    // console.log(document.title);

    sheet = document.sheetsByIndex[0];

    const { title, lastColumnLetter, rowCount } = sheet;

    await sheet.loadCells(`A1:${lastColumnLetter}${rowCount}`);

    // console.log(Object.keys(sheet));
    // console.log(sheet._rawProperties.gridProperties.columnCount);

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
                    // console.log("INVALID TYPE");
                }
            }
            
            // JUST FOR TESTING, HAVE SOME QUESTIONS COMPLETE
            for (let i = 0; i < newCategory.questions.length; i++) {
                newCategory.questions[i].complete = !(i % 3);
            }


            boardData.push(newCategory);
        }
    }




    console.log(boardData[0]);
    //console.log(categories[0].questions);



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
        console.log(clc.green("Server started."));
    });
}



// controller.onChar('P', (data) => {
//     console.log("Button pressed on " + data);
// });

// -------- SETUP --------

controller.onChar('P', (data) => {
    if (gameState.binding) {
        let index = parseInt(data.slice(0, 1)); // Ensure only 1 digit grabbed

        let existing = gameState.players.findIndex(p => p.buzzer === index);
        if (existing >= 0) {
            console.log(clc.redBright(`Overwriting player ${gameState.players[existing].name} with player ${gameState.binding.name} on Buzzer ${index}`));
            gameState.players[existing] = new Player(gameState.binding.name, index, gameState.binding.colour);
        } else {
            console.log(clc.magentaBright(`Bound ${gameState.binding.name} to Buzzer ${index}`));
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

controller.onChar('B', (data) => {
    // Player buzzed in
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
            console.log(clc.redBright("Cannot bind player without name and colour!"))
            res.sendStatus(200);
            return;
        }

        gameState.binding = {
            name: req.body.name,
            colour: req.body.colour
        }

        console.log(clc.magentaBright(`Binding player ${req.body.name}`));

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
        console.log(clc.bgGreen(`Host registered to IP ${host_ip}}`))
        res.sendStatus(200);
    } else if (req.ip !== host_ip) {
        // If a non-host tries the endpoint
        console.log(`Cannot register host to IP ${req.ip}, host already registered to IP ${host_ip}}`)
        res.sendStatus(403);
    } else {
        // If the host tries the endpoint
        console.log(`Host already registered to IP ${host_ip}}`)
        res.sendStatus(200);
    }
});


app.get("/board-data", (req, res) => {
    if (!display_ip) {
        display_ip = req.ip
        console.log(clc.bgGreen(`Display registered to IP ${display_ip}}`))
        res.json(boardData);
    } else if (req.ip === display_ip || req.ip === host_ip || debugAuth) {
        res.send(boardData);
    } else {
        console.log("Illegal access attempy by " + req.ip);
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
                console.log(clc.redBright("Could not find selected category!"));
                return res.sendStatus(400);
            }

            let question = category.questions.find(qu => qu.title === req.body.question);

            if (!question) {
                console.log(clc.redBright("Could not find selected question!"));
                return res.sendStatus(400);
            }

            gameState.state = STATES.WAITING;
            gameState.activeCategory = category;
            gameState.activeQuestion = question;

            console.log(gameState.activeCategory);
            console.log(gameState.activeQuestion);
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
        console.log(clc.redBright(`Host modified ${player.name}'s points by ${req.body.points} | ${player.points - req.body.points} -> ${player.points}`));
        res.sendStatus(200);
    } else {
        res.sendStatus(403);    // Access Forbidden
    }
});

app.get("/player-stats", (req, res) => {

});


app.post("/buzzer", (req, res) => {
    if (!control_board_ip) {
        control_board_ip = req.ip
        console.log(`Buzzer control board registered to IP ${control_board_ip}}`)
    }
});


startServer()










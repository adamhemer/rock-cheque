require('dotenv').config();

const express = require('express');
const app = express();
const cors = require('cors');
const port = 8000;
const { ControlBoard } = require('./ControlBoard');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const { Category, Question } = require('./CategoryQuestion');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded());
app.use(express.static(__dirname + "/public"));


var host_ip;
var control_board_ip;

var listener;


const serviceAccountAuth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: Buffer.from(process.env.GOOGLE_PRIVATE_KEY , 'base64').toString('ascii'),
    scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
    ],
});


const document = new GoogleSpreadsheet('1PhDNYLUodoj0HWHkgYcoxYkg7U2j2d1WauuXQJ1QJs4', serviceAccountAuth)
var sheet;



// const controller = new ControlBoard("COM3", 115200);
// controller.reset();



var categories = [];


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
            
            categories.push(newCategory);
        }
    }




    console.log(categories[0]);
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
        console.log("Server started.");
    });
}


app.get("/", (req, res) => {
    res.sendFile(__dirname + "/views/index.html");
});


app.post("/host", (req, res) => {
    if (!host_ip) {
        // Register the host IP
        host_ip = req.ip
        console.log(`Host registered to IP ${host_ip}}`)
        res.sendStatus(202);
    } else if (req.ip != host_ip) {
        // If a non-host tries the endpoint
        console.log(`Cannot register host to IP ${req.ip}, host already registered to IP ${host_ip}}`)
        res.sendStatus(423);
    } else {
        // If the host tries the endpoint
        console.log(`Host already registered to IP ${host_ip}}`)
    }
});

app.get("/player-stats", (req, res) => {

});


app.post("/buzzer", (req, res) => {
    if (!control_board_ip) {
        control_board_ip = req.ip
        console.log(`Buzzer control board registered to IP ${host_ip}}`)
    }
});


startServer()










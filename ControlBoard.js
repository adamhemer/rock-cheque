const { SerialPort, ReadlineParser } = require('serialport')
const clc = require("cli-color");

var events = {  // Has to be global because serialHandler cant access 'this', only sees parser object not ControlBoard object
    '>': console.log    // Verbose logging command
};

class ControlBoard {
    constructor(COM_PORT, BAUD_RATE) {
        this.port = COM_PORT
        this.baud = BAUD_RATE
        this.serial = new SerialPort({ path: this.port, baudRate: this.baud })
        this.parser = new ReadlineParser()
        this.serial.pipe(this.parser)
        this.parser.on('data', this.serialHandler)

        // this.serial.write('C0|16711680')
        // this.events = { '>': console.log };
        // console.log(this.events);
    }

    onChar(char, func) {    // When serial receives 'char' call func()
        events[char] = func;
    }

    serialHandler(line) {
        let command = line.slice(0, 1);     // First char is command
        let data = line.slice(1);           // Send the rest of the line as data
        if (events && command in events) {
            // console.log(`Serial command: ${command}, with data: ${data}`);
            events[command](data);
        } else {
            console.log(clc.yellow(`No event registered for command ${command}`));
        }
    }

    setColour(index, colour) {
        let col = parseInt(colour.slice(-6), 16); // Removes # if its present
        this.serial.write(`C${index}|${col}`);
    }

    answer(correct) {
        this.serial.write(correct ? "Y" : "N");
    }

    reset() {
        this.serial.write("R");
    }

    armBuzzers() {
        this.serial.write("A");
    }
}

exports.ControlBoard = ControlBoard;
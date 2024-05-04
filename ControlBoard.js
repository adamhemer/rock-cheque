const { SerialPort, ReadlineParser } = require('serialport')

class ControlBoard {
    constructor(COM_PORT, BAUD_RATE) {
        this.port = COM_PORT
        this.baud = BAUD_RATE
        this.serial = new SerialPort({ path: this.port, baudRate: this.baud })
        this.parser = new ReadlineParser()
        this.serial.pipe(this.parser)
        this.parser.on('data', this.serialHandler)

        // this.serial.write('C0|16711680')
    }

    serialHandler(arg) {
        console.log(arg)
    }

    answer(correct) {
        this.serial.write(correct ? "Y" : "N")
    }

    reset() {
        this.serial.write("R")
    }
}

exports.ControlBoard = ControlBoard;
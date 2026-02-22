

class Player {
    constructor(name, buzzer, colour) {
        this.name = name;
        this.buzzer = buzzer;
        this.colour = colour;
        this.points = 0;
        this.buzzLate = 0;
    }

}

exports.Player = Player;
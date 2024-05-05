class Category {

    constructor(title) {
        this.title = title;
        this.questions = [];
    }

}

const TYPES = {
    TEXT: "Text",
    IMAGE: "Image",
    VIDEO: "Video",
    AUDIO: "Audio"
}

class Question {

    static get TYPES() {
        return TYPES;
    }

    static QuestionBuilder = class {
        
        withText(text) {
            this.type = TYPES.TEXT;
            this.title = text;
            return this;
        }

        withTextAnswer(text) {
            this.answer = text;
            return this;
        }

        withImage(source) {
            this.type = TYPES.IMAGE;
            this.src = source;
            this.answer_src = source;
            return this;
        }

        withImageAnswer(source) {
            this.answer_src = source;
            return this;
        }
        
        withVideo(source) {
            this.type = TYPES.VIDEO;
            this.src = source;
            this.playFrom = 0;
            this.playTo = -1;
            return this;
        }

        withAudio(source) {
            this.type = TYPES.AUDIO;
            this.src = source;
            this.playFrom = 0;
            this.playTo = -1;
            return this;
        }

        startAt(time) {
            this.playFrom = time;
            return this;
        }

        pauseAt(time) {
            this.playTo = time;
            return this;
        }

        pointReward(points) {
            this.reward = points;
            return this;
        }

        build() {
            const q = new Question(
                this.type,
                this.title,
                this.answer,
                this.src,
                this.answer_src,
                this.playFrom,
                this.playTo,
                this.reward
            );
            return q
        }

    }

    constructor(type, title, answer, src, answer_src, playFrom, playTo, reward) {
            this.type = type;
        
            this.title = title;
            this.answer = answer;
            
            this.src = src;
            this.answer_src = answer_src;

            this.playFrom = playFrom;
            this.playTo = playTo;
            
            this.reward = reward;

            this.complete = false;
    }

}


exports.Question = Question;
exports.Category = Category;
/*
    ========================================================
    STEAM SERVICE
    ========================================================
*/


const steamService = {

    status:
        "offline",


    games:
        [],


    async initialize() {

        console.log(
            "Steam service initialized."
        );


        /*
            Actual Steam Web API integration will eventually
            populate this.games automatically.
        */

        this.status =
            "offline";

    },


    async getLibrary() {

        return this.games;

    },


    async getFriends() {

        return [];

    }

};


window.steamService =
    steamService;
/*
    ========================================================
    RIOT SERVICE
    ========================================================
*/


const riotService = {


    status:
        "offline",


    async initialize() {

        console.log(
            "Riot service initialized."
        );


    },


    async getLeagueStatus() {

        return {

            connected:
                false

        };

    },


    async getValorantStatus() {

        return {

            connected:
                false

        };

    }


};


window.riotService =
    riotService;
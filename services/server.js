/*
    ========================================================
    SERVER SERVICE
    ========================================================
*/


const serverService = {


    status:
        "offline",


    services: {

        portainer:
            false,

        grafana:
            false,

        pihole:
            false,

        uptimeKuma:
            false,

        cockpit:
            false

    },


    async initialize() {

        console.log(
            "Server service initialized."
        );

    },


    async getStatus() {

        return {

            connected:
                false,

            services:
                this.services

        };

    }


};


window.serverService =
    serverService;
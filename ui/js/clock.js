/*
    ========================================================
    CLOCK
    ========================================================
*/


function updateClock() {

    const clock =
        document.getElementById(
            "clock"
        );


    if (
        !clock
    ) {

        return;

    }


    const now =
        new Date();


    const use24Hour =
        window.settingsData &&
        window.settingsData.clock24Hour === true;


    clock.textContent =
        now.toLocaleTimeString(
            [],
            {

                hour: "2-digit",

                minute: "2-digit",

                hour12:
                    !use24Hour

            }
        );

}


updateClock();


setInterval(
    updateClock,
    1000
);
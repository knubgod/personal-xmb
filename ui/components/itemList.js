/*
    ========================================================
    PERSONAL XMB
    ITEM LIST
    ========================================================

    Responsible for the vertical list underneath a
    selected category.

    The list is built from categories.json.
*/


function updateItemList() {

    if (
        !window.categoriesData
    ) {

        return;

    }


    const categoryNames =
        Object.keys(
            window.categoriesData
        );


    const activeCategory =
        categoryNames[
            currentCategory
        ];


    const activeData =
        window.categoriesData[
            activeCategory
        ];


    if (!activeData) {

        console.warn(
            "No data found for category:",
            activeCategory
        );

        return;

    }


    const items =
        Array.isArray(
            activeData.items
        )
            ? activeData.items
            : [];


    /*
        Make sure the current item index is valid.
    */

    if (
        items.length === 0
    ) {

        currentItem =
            0;

    } else if (
        currentItem >=
        items.length
    ) {

        currentItem =
            items.length - 1;

    }


    renderItemList(
        items,
        currentItem
    );

}


/*
    ========================================================
    RENDER ITEM LIST
    ========================================================
*/

function renderItemList(
    items,
    selectedIndex = 0
) {

    const container =
        document.getElementById(
            "items"
        );


    if (!container) {

        console.warn(
            "Item container not found."
        );

        return;

    }


    container.innerHTML =
        "";


    items.forEach(
        (item, index) => {

            const element =
                document.createElement(
                    "div"
                );


            element.className =
                "item";


            element.dataset.index =
                index;


            element.dataset.type =
                item.type ||
                "item";


            /*
                ====================================================
                ICON
                ====================================================
            */

            const icon =
                document.createElement(
                    "img"
                );


            icon.className =
                "item-icon";


            icon.alt =
                "";


            if (
                item.icon
            ) {

                icon.src =
                    item.icon;

            }


            /*
                ====================================================
                TEXT
                ====================================================
            */

            const content =
                document.createElement(
                    "div"
                );


            content.className =
                "item-content";


            const name =
                document.createElement(
                    "div"
                );


            name.className =
                "item-name";


            name.textContent =
                item.name ||
                "Unnamed Item";


            content.appendChild(
                name
            );


            /*
                Platform text intentionally removed.

                Platform information can still be displayed
                in the selected item's preview/details area.
            */


            /*
                ====================================================
                BUILD ITEM
                ====================================================
            */

            element.appendChild(
                icon
            );


            element.appendChild(
                content
            );


            /*
                ====================================================
                SELECTED STATE
                ====================================================
            */

            if (
                index ===
                selectedIndex
            ) {

                element.classList.add(
                    "selected"
                );

            }


            container.appendChild(
                element
            );

        }
    );


    updateItemSelectionVisual(
        selectedIndex
    );

}


/*
    ========================================================
    UPDATE ITEM SELECTION
    ========================================================
*/

function updateItemSelectionVisual(
    selectedIndex
) {

    const container =
        document.getElementById(
            "items"
        );


    if (!container) {
        return;
    }


    const items =
        container.querySelectorAll(
            ".item"
        );


    items.forEach(
        (item, index) => {

            item.classList.toggle(
                "selected",
                index === selectedIndex
            );

        }
    );


    /*
        ====================================================
        KEEP SELECTED ITEM VISIBLE
        ====================================================
    */

    const selectedItem =
        items[
            selectedIndex
        ];


    if (
        selectedItem
    ) {

        selectedItem.scrollIntoView({
            behavior: "smooth",
            block: "nearest"
        });

    }

}
import Utility from "./utility.mjs";

export default class SliderDialog extends Dialog {
  /**
   * Creates and displays a configurable dialog.
   * @param title {string} The title of the dialog.
   * @param data {Array<Array<Object>>} The data for the dialog fields.
   * @param confirmLabel {string} The label for the confirm button.
   * @param cancelLabel {string} The label for the cancel button.
   * @param buttons {Object} The buttons for the dialog.
   * @param options {Object} The options for the dialog.
   * @returns {Promise<number>} The quantity selected by the user.
   */
  static async create({
    title,
    confirmLabel = game.i18n.localize("Confirm"),
    cancelLabel = game.i18n.localize("Cancel"),
    minValue = 1,
    maxValue = 10,
    initialValue = 1,
    buttons = null,
    render = null,
    options = {}
  }) {
    buttons ??= {
      confirm: {
        label: confirmLabel,
        callback: (html) => {
          let quantity = html.find("#quantity")[0].value;
          if (isNaN(quantity)) {
            Utility.log("Item quantity invalid");
            return ui.notifications.error("Item quantity invalid.");
          } else {
            quantity = Number(quantity);
          }
          return Math.clamped(quantity, minValue, maxValue);
        }
      },
      ignore: {
        label: cancelLabel,
        callback: () => null
      }
    };
    render ??= (html) => {
      html.find("#quantitySlider").on("input", (e) => {
        html.find("#quantity").val(e.target.value);
      });
      html.find("#quantity").on("input", (e) => {
        html.find("#quantitySlider").val(e.target.value);
      });
    };
    return await Dialog.wait(
      {
        title: title,
        content: `<form>
          <div class="form-group">
            <input class="slider" id="quantitySlider" min=${minValue} max=${maxValue} value=${initialValue} type="range">
          </div>
          <div class="form-group">
            <input style="text-align: center" id="quantity" min=${minValue} max=${maxValue} value=${initialValue} type="number">
          </div>
          </form>`,
        buttons,
        default: "confirm",
        render: render,
        close: () => null
      },
      options
    );
  }
}

import RobakMarketWfrp4e from "./market.mjs";
import Utility from "./utility.mjs";

export default class CurrencyApp extends FormApplication {
  /**
   * @param {CurrencySet[]} currencies - Given currencies.
   * @param {number} needed - The amount of requested currency needed.
   * @param {Region} requestedRegion - The region to convert currency to.
   * @param {Function} resolve - The resolve function to call on form submission.
   */
  constructor(currencies, needed, requestedRegion, resolve) {
    super();
    this.currencies = currencies;
    this.needed = needed;
    this.requestedRegion = requestedRegion;
    this.resolve = resolve;
    this.total = 0;

    this.fields = this.currencies
      .map((currency) => {
        const localMoney = RobakMarketWfrp4e.formatMoney(currency.getValue(), currency.region);
        const converted = currency.getConvertedValue(requestedRegion);
        const globalMoney = RobakMarketWfrp4e.formatMoney(converted, requestedRegion);
        const modifier = Utility.round(currency.getExchangeModifier(requestedRegion), 2);
        return {
          currency: currency,
          name: `${localMoney} (${globalMoney}) [x${modifier}]`,
          img: currency.region.getMainCoin().img,
          value: currency.getValue(),
          converted,
          active: ""
        };
      })
      .filter((field) => field.converted > 0)
      .toSorted((a, b) => a.converted - b.converted);
  }

  static get defaultOptions() {
    const options = foundry.utils.mergeObject(super.defaultOptions, {
      id: "currency-app",
      title: "Select currency to pay",
      resizable: false,
      width: 400,
      template: "modules/wfrp4e-macros-and-more/templates/currency-dialog.hbs"
    });
    options.classes.push("dialog");
    options.classes.push("item-dialog");
    return options;
  }

  submit(options) {
    if (this.total < this.needed) {
      ui.notifications.error("Selected currency does not cover the needed amount.");
      return;
    }
    let result = this.fields.filter((field) => field.active === "active").map((field) => field.currency);
    this.resolve(result);
    return super.close();
  }

  close(options) {
    this.resolve(null);
    return super.close();
  }

  getData({options = {}}) {
    let data = super.getData(options);
    data.fields = this.fields;
    data.neededText = RobakMarketWfrp4e.formatMoney(this.needed, this.requestedRegion);
    data.totalText = RobakMarketWfrp4e.formatMoney(this.total, this.requestedRegion);
    return data;
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.on("click", ".document-name", (ev) => {
      let document = $(ev.currentTarget).parents(".document")[0];
      if (document.classList.contains("active")) {
        this.fields[document.dataset.index].active = "";
        this.total -= parseInt(document.dataset["converted"]);
      } else {
        this.fields[document.dataset.index].active = "active";
        this.total += parseInt(document.dataset["converted"]);
      }
      this.render(true);
    });
    html.on("click", `button[id="pay"]`, async () => await this.submit());
    html.on("click", `button[id="cancel"]`, async () => await this.close());
  }
}

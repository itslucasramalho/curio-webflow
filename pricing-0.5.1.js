"use strict";
class FusionAuthPriceCalculator {
  constructor() {
    this.accountHost = "account.fusionauth.io";
    this.hostingSelectionDiv = document.getElementById("hosting-selection");
    this.hostingPriceDiv = document.getElementById("hosting-price");
    this.planSelectionDiv = document.getElementById("plan-selection");
    this.planPriceDiv = document.getElementById("plan-price");
    this.mauChargeDiv = document.getElementById("mau-charge");
    this.sumLabel = document.getElementById("estimate-total");
    this.sumDiv = document.getElementById("total-price");
    this.summaryElement = document.getElementById("summary");
    this.buyNowButton = document.querySelector(".pricing_summary_button");
    this.monthlyActiveUserSlider = document.querySelector(
      "input[name=monthly-active-users]"
    );
    this.monthlyActiveUserSlider.addEventListener("input", (event) =>
      this._handleSliderChange(event)
    );
    this.monthlyActiveUserSlider.addEventListener("mouseup", (event) =>
      this._handleSliderChange(event)
    );
    this.monthlyActiveUserSliderMin = parseInt(
      this.monthlyActiveUserSlider.getAttribute("min")
    );
    this.monthlyActiveUserSliderMax = parseInt(
      this.monthlyActiveUserSlider.getAttribute("max")
    );
    this.monthlyActiveUserValue = document.getElementById(
      "monthly-active-users-value"
    );
    this.communityButton = document.querySelector("a[data-plan=Community]");
    this.starterButton = document.querySelector("a[data-plan=Starter]");

    this.billingToggle = document.getElementById("billing-toggle");
    this.billingToggle.addEventListener("click", (event) =>
      this._handleBillingIntervalChange(event)
    );
    this._loadState();
    this.billingInterval = "monthly";

    document
      .querySelectorAll("a[data-step]")
      .forEach((e) =>
        e.addEventListener("click", (event) => this._handleStepClick(event))
      );

    document
      .querySelectorAll("a[data-hosting]")
      .forEach((e) =>
        e.addEventListener("click", (event) => this._handleHostingClick(event))
      );

    document
      .querySelectorAll("a[data-plan]")
      .forEach((e) =>
        e.addEventListener("click", (event) => this._handlePlanClick(event))
      );
    window.addEventListener("popstate", (event) =>
      this._handleStateChange(event)
    );

    if (window.location.hostname.includes("webflow.io")) {
      fetch("http://localhost:5500/price-model.json")
        .then((response) => response.json())
        .then((json) => {
          this.priceModel = json;
          this._changeStep();
          this._drawPlanPrices();
        });
    } else {
      // Use production price model
      fetch(`https://${this.accountHost}/ajax/purchase/price-model`)
        .then((response) => response.json())
        .then((json) => {
          this.priceModel = json;
          this._changeStep();
          this._drawPlanPrices();
        });
    }
  }

  _calculateHostingPrice(type) {
    let price = 0;

    if (type === "basic-cloud") {
      price = this.priceModel.ec2["medium"] / 2;
    } else if (type === "business-cloud") {
      price = this.priceModel.ec2["medium"] + this.priceModel.rds["medium"];
    } else if (type === "ha-cloud") {
      price =
        2 * this.priceModel.ec2["medium"] +
        this.priceModel.elb.base +
        this.priceModel.rds["medium"] * 2;
    }

    price = Math.floor(price);

    if (this.billingInterval === "yearly") {
      price *= 12;
    }

    return price;
  }

  _getBillingIntervalKey(billingInterval) {
    const interval = billingInterval || this.billingInterval;
    return "pricePerUnit" + this._billingIntervalReadable(interval);
  }

  _billingIntervalReadable(billingInterval) {
    const interval = billingInterval || this.billingInterval;
    return interval.charAt(0).toUpperCase() + interval.slice(1);
  }

  _calculatePlanPrice(plan) {
    if (!plan || plan === "Community") {
      return { planPrice: 0, mauPrice: 0, discount: 0 };
    }

    const mau = parseInt(this.monthlyActiveUserSlider.value);
    const planPricing = this.priceModel.plan.tierPricing[plan];
    const billingKey = this._getBillingIntervalKey();
    const increments = mau / 10000;
    let mauPrice;

    if (increments < 10) {
      mauPrice = planPricing.tier2[billingKey] * (increments - 1);
    } else if (increments < 100) {
      mauPrice =
        planPricing.tier2[billingKey] * 9 +
        planPricing.tier3[billingKey] * (increments - 10);
    } else {
      mauPrice =
        planPricing.tier2[billingKey] * 9 +
        planPricing.tier3[billingKey] * 90 +
        planPricing.tier4[billingKey] * (increments - 100);
    }

    let discount = 0;
    const basePrice = planPricing.base[billingKey];

    if (plan && plan !== "Community") {
      const monthlyPrice = planPricing.base["pricePerUnitMonthly"] * 12;
      const yearlyPrice = planPricing.base["pricePerUnitYearly"];

      discount = Math.round(
        (100.0 * (monthlyPrice - yearlyPrice)) / monthlyPrice
      );
    }

    return { planPrice: basePrice, mauPrice: mauPrice, discount: discount };
  }

  _changeStep() {
    this._redraw();
    if (this.step) {
      this.url.searchParams.set("step", this.step);
    }
    if (this.hosting) {
      this.url.searchParams.set("hosting", this.hosting);
    }
    if (this.plan) {
      this.url.searchParams.set("plan", this.plan);
    }
  }

  _handleHostingClick(event) {
    event.stopPropagation();
    event.preventDefault();
    this.hosting = event.currentTarget.dataset.hosting;
    if (!this.plan) {
      this.step = "plan";
    }
    this._redraw();
  }

  _handlePlanClick(event) {
    const plan = event.currentTarget.dataset.plan;
    if (this.hosting === "self-hosting" && plan === "Community") {
      this.step = "plan";
      this._redraw();
      return;
    }

    event.stopPropagation();
    event.preventDefault();
    if (plan) {
      this.plan = plan;
    }
    this.step = "hosting";
    this._redraw();
  }

  _handleSliderChange() {
    const mau = parseInt(this.monthlyActiveUserSlider.value);
    let mauText = new Intl.NumberFormat("en").format(mau);
    if (mau === 1000000) {
      mauText += "+";
    }
    this.monthlyActiveUserValue.innerText = mauText;

    const width = this.monthlyActiveUserSlider.offsetWidth;
    const ratio =
      (mau - this.monthlyActiveUserSliderMin) /
      (this.monthlyActiveUserSliderMax - this.monthlyActiveUserSliderMin);
    let left = ratio * (width - 30) + 5;
    if (left > width / 2) {
      left -= 10;
    }
    if (left > width - 50) {
      left -= 15;
    }
    this.monthlyActiveUserValue.style.left = left + "px";
    this._redraw();
  }

  _handleBillingIntervalChange() {
    if (this.billingInterval === "monthly") {
      this.billingInterval = "yearly";
      this.billingToggle.classList.add("toggle-on");
      this.billingToggle.classList.remove("toggle-off");
    } else {
      this.billingInterval = "monthly";
      this.billingToggle.classList.add("toggle-off");
      this.billingToggle.classList.remove("toggle-on");
    }

    this._redraw();
  }

  _handleStateChange() {
    this._loadState();
    this._redraw();
  }

  _handleStepClick(event) {
    event.stopPropagation();
    event.preventDefault();

    this.step = event.currentTarget.dataset.step;
    this._changeStep();
    window.history.pushState({}, "", this.url);
  }

  _loadState() {
    this.url = new URL(window.location);
    this.step = this.url.searchParams.get("step");
    this.hosting = this.url.searchParams.get("hosting");
    this.plan = this.url.searchParams.get("plan");
    if (this.step === null) {
      this.step = "plan";
    }
  }

  _drawPlanPrices() {
    for (const plan in FusionAuthPriceCalculator.plans) {
      if (plan !== "community") {
        const planPricing =
          this.priceModel.plan.tierPricing[
            FusionAuthPriceCalculator.plans[plan]
          ];
        const billingKey = this._getBillingIntervalKey();
        let price = planPricing.base[billingKey];
        const pricingDiv = document.getElementById(plan + "-base-price");

        if (this.billingInterval === "yearly") {
          price = Math.ceil(price / 12.0);
        }

        pricingDiv.textContent = price.toLocaleString();
      }
    }
  }

  _redraw() {
    document
      .querySelectorAll(`div[data-step]`)
      .forEach((e) => (e.style.display = "none"));
    document.querySelector(`div[data-step=${this.step}]`).style.display =
      "flex";

    document
      .querySelectorAll("a[data-step]")
      .forEach((e) => e.classList.remove("active"));
    document.querySelector(`a[data-step=${this.step}]`).classList.add("active");

    document
      .querySelectorAll("a[data-plan]")
      .forEach((e) => e.classList.remove("active"));
    if (this.plan) {
      const planButton = document.querySelector(`a[data-plan="${this.plan}"]`);
      if (planButton) planButton.classList.add("active");
    }

    document
      .querySelectorAll("a[data-hosting]")
      .forEach((e) => e.classList.remove("active"));
    if (this.hosting) {
      const hostingButton = document.querySelector(
        `a[data-hosting="${this.hosting}"]`
      );
      if (hostingButton) hostingButton.classList.add("active");
    }

    if (this.hosting !== "self-hosting") {
      if (this.hosting !== "ha-cloud") {
        document.querySelectorAll("a[data-plan]").forEach((button) => {
          const planValue = button.getAttribute("data-plan");
          if (planValue !== "Community") {
            button.innerText = this.plan === planValue ? "Selected" : "Select";
          }
        });
      }

      document.querySelectorAll("a[data-hosting]").forEach((button) => {
        const hostingValue = button.getAttribute("data-hosting");
        if (hostingValue !== "self-hosting") {
          button.innerText =
            this.hosting === hostingValue ? "Selected" : "Select";
        }
      });
    }

    this.hostingSelectionDiv.innerText = this.hosting
      ? FusionAuthPriceCalculator.names[this.hosting]
      : "-";
    this.planSelectionDiv.innerText = this.plan ? this.plan : "-";

    const hostingPrice = this.hosting
      ? this._calculateHostingPrice(this.hosting)
      : 0;

    if (this.hosting) {
      this.hostingPriceDiv.innerText =
        "$" + new Intl.NumberFormat("en").format(Math.floor(hostingPrice));
    } else {
      this.hostingPriceDiv.innerText = "-";
    }

    if (this.hosting === "ha-cloud") {
      this.communityButton.href = "#";
      this.communityButton.innerText = "Not available";
      this.communityButton.classList.add("grayed-out");
      this.communityButton.setAttribute("disabled", "disabled");
      this.starterButton.innerText = "Not available";
      this.starterButton.setAttribute("disabled", "disabled");
      this.starterButton.classList.add("grayed-out");
      if (this.plan === "Community" || this.plan === "Starter") {
        this.plan = null;
        this.step = "plan";
        this._redraw();
      }
    } else if (this.hosting !== "self-hosting") {
      this.communityButton.href = "#";
      this.communityButton.innerText = "Select";
      this.communityButton.classList.remove("grayed-out");
      this.communityButton.removeAttribute("disabled");
      this.starterButton.innerText = "Select";
      this.starterButton.removeAttribute("disabled");
      this.starterButton.classList.remove("grayed-out");
    } else {
      this.communityButton.href = "/download";
      this.communityButton.innerText = "Download";
    }

    this._updatePriceBox(hostingPrice);

    this._drawPlanPrices();

    if (this.plan && this.hosting) {
      this.buyNowButton.classList.add("active");
      this.buyNowButton.innerText = "Get Started";
      this.buyNowButton.removeAttribute("disabled");
    } else {
      this.buyNowButton.classList.remove("active");
      this.buyNowButton.setAttribute("disabled", "disabled");
    }

    if (this.hosting || this.plan) {
      this.summaryElement.classList.add("is-fixed");
    }
  }

  _updatePriceBox(hostingPrice) {
    document
      .querySelectorAll("div[data-plan]")
      .forEach((e) => e.classList.remove("active"));

    const billingIntervalLabel =
      this.billingInterval === "yearly" ? "annually" : "monthly";
    const billingIntervalLabelAdj =
      this.billingInterval === "yearly" ? "Annual" : "Monthly";
    document
      .querySelectorAll("[renewal-abb]")
      .forEach(
        (e) =>
          (e.textContent = this.billingInterval === "yearly" ? "/yr" : "/mo")
      );
    document
      .querySelectorAll(".billed")
      .forEach((e) => (e.textContent = billingIntervalLabel));
    document.getElementById("billing-text").textContent =
      billingIntervalLabelAdj;
    this.sumLabel.textContent =
      this.billingInterval === "yearly" ? "Total" : "Estimate Total";

    const { planPrice, mauPrice, discount } = this._calculatePlanPrice(
      this.plan
    );

    if (this.plan) {
      this.planPriceDiv.innerText =
        "$" +
        new Intl.NumberFormat("en").format(Math.floor(planPrice + mauPrice));

      document
        .querySelector(`div[data-plan=${this.plan}]`)
        .classList.add("active");

      document.getElementById("annual-discount-label").style.display = "block";
      document.getElementById(
        "annual-discount-label"
      ).innerText = `(Save up to ${discount}% yearly)`;
    } else {
      this.planPriceDiv.innerText = "-";
      document.getElementById("annual-discount-label").style.display = "none";
    }

    if (
      (!this.hosting ||
        this.hosting === "self-hosting" ||
        this.hosting === "basic-cloud") &&
      (!this.plan || this.plan === "Community" || this.plan === "Starter")
    ) {
      this.sumDiv.innerText = "Free trial";
      this.sumDiv.nextElementSibling.style.display = "none";
    } else if (hostingPrice !== 0 || planPrice !== 0) {
      this.sumDiv.innerText =
        "$" +
        new Intl.NumberFormat("en").format(
          Math.floor(hostingPrice + planPrice + mauPrice)
        );
      this.sumDiv.nextElementSibling.style.display = "inline";
    } else {
      this.sumDiv.innerText = "-";
      this.sumDiv.nextElementSibling.style.display = "inline";
    }
  }
}

FusionAuthPriceCalculator.names = {
  "basic-cloud": "Basic",
  "business-cloud": "Business",
  "ha-cloud": "High Availability",
  "self-hosting": "Self-hosting",
};

FusionAuthPriceCalculator.plans = {
  community: "Community",
  starter: "Starter",
  essentials: "Essentials",
  enterprise: "Enterprise",
};

document.addEventListener(
  "DOMContentLoaded",
  () => new FusionAuthPriceCalculator()
);

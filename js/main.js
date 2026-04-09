const DATA_PATH = "data.csv";

const svgBar = d3.select("#bar-chart");
const svgLine = d3.select("#line-chart");
const measureSelect = document.getElementById("measure-select");
const yearSelect = document.getElementById("year-select");
const topNSelect = document.getElementById("topn-select");
const countrySelect = document.getElementById("country-select");
const methodList = document.getElementById("method-list");

const tooltip = d3
	.select("body")
	.append("div")
	.attr("class", "tooltip");

const state = {
	raw: [],
	filteredByMeasure: [],
	selectedMeasure: "",
	selectedYear: "",
	selectedTopN: 20,
	selectedCountry: "",
};

function getDimensions(svg) {
	const width = svg.node().clientWidth;
	const height = svg.node().clientHeight;

	return {
		width,
		height,
		margin: { top: 28, right: 24, bottom: 94, left: 108 },
	};
}

function formatValue(v) {
	return d3.format(",.2f")(v);
}

function parseNumberStrict(rawValue) {
	if (rawValue === null || rawValue === undefined) {
		return Number.NaN;
	}

	const cleaned = String(rawValue).trim().replace(/,/g, "");
	if (cleaned === "") {
		return Number.NaN;
	}

	const parsed = Number(cleaned);
	return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function readFirstNumericField(row, keys) {
	for (const key of keys) {
		const value = parseNumberStrict(row[key]);
		if (Number.isFinite(value)) {
			return value;
		}
	}
	return Number.NaN;
}

function showError(message) {
	d3.select(".layout")
		.append("p")
		.attr("class", "error")
		.text(message);
}

function uniqueSorted(array, asNumbers = false) {
	const values = Array.from(new Set(array.filter((d) => d !== "" && d !== null && d !== undefined)));
	if (asNumbers) {
		return values.map(Number).filter((d) => Number.isFinite(d)).sort((a, b) => a - b);
	}
	return values.sort((a, b) => String(a).localeCompare(String(b)));
}

function buildControls() {
	const measures = uniqueSorted(state.raw.map((d) => d.measureLabel));
	measures.forEach((m) => {
		const option = document.createElement("option");
		option.value = m;
		option.textContent = m;
		measureSelect.appendChild(option);
	});

	state.selectedMeasure = measures[0] || "";
	measureSelect.value = state.selectedMeasure;

	const years = uniqueSorted(
		state.raw
			.filter((d) => d.measureLabel === state.selectedMeasure)
			.map((d) => d.year),
		true
	);

	yearSelect.innerHTML = "";
	years.forEach((y) => {
		const option = document.createElement("option");
		option.value = String(y);
		option.textContent = String(y);
		yearSelect.appendChild(option);
	});
	state.selectedYear = years[years.length - 1] ? String(years[years.length - 1]) : "";
	yearSelect.value = state.selectedYear;

	state.selectedTopN = Number(topNSelect.value);
}

function refreshCountryControl() {
	const countries = uniqueSorted(state.filteredByMeasure.map((d) => d.countryName));

	const currentValueStillValid = countries.includes(state.selectedCountry);
	if (!currentValueStillValid) {
		state.selectedCountry = countries[0] || "";
	}

	countrySelect.innerHTML = "";
	countries.forEach((country) => {
		const option = document.createElement("option");
		option.value = country;
		option.textContent = country;
		countrySelect.appendChild(option);
	});

	countrySelect.value = state.selectedCountry;
}

function updateTransparencyNotes(displayedCount, totalCountInYear) {
	if (!methodList) {
		return;
	}

	const unit = state.filteredByMeasure[0]?.unit || "Unit not reported";

	const notes = [
		"Raw source file is displayed directly from the provided OECD CSV without hand-edited values.",
		`Measure filter: "${state.selectedMeasure}" only.`,
		`Year filter for ranking chart: ${state.selectedYear}.`,
		`Missing or non-numeric observations are excluded from plotting (${totalCountInYear - displayedCount} omitted for current bar chart view).`,
		state.selectedTopN > 0
			? `Ranking filter: showing top ${state.selectedTopN} countries by observation value for readability.`
			: "Ranking filter: showing all available countries for the selected year.",
		`Sorting rule for bars: descending by observation value (largest to smallest).`,
		`Value unit used in tooltips and axes: ${unit}.`,
	];

	methodList.innerHTML = "";
	notes.forEach((note) => {
		const li = document.createElement("li");
		li.textContent = note;
		methodList.appendChild(li);
	});
}

function drawBarChart() {
	const yearData = state.filteredByMeasure
		.filter((d) => String(d.year) === state.selectedYear)
		.filter((d) => d.pollutant && d.pollutant.includes("Greenhouse"))
		.filter((d) => Number.isFinite(d.value));

	yearData.sort((a, b) => b.value - a.value);

	const displayedData = state.selectedTopN > 0 ? yearData.slice(0, state.selectedTopN) : yearData;

	const dims = getDimensions(svgBar);
	const { width, height, margin } = dims;
	const innerWidth = width - margin.left - margin.right;
	const innerHeight = height - margin.top - margin.bottom;

	svgBar.selectAll("*").remove();

	const g = svgBar
		.append("g")
		.attr("transform", `translate(${margin.left}, ${margin.top})`);

	const x = d3
		.scaleBand()
		.domain(displayedData.map((d) => d.countryName))
		.range([0, innerWidth])
		.padding(0.14);

	const y = d3
		.scaleLinear()
		.domain([0, d3.max(displayedData, (d) => d.value) || 0])
		.nice()
		.range([innerHeight, 0]);

	g.append("g")
		.attr("class", "grid")
		.call(d3.axisLeft(y).tickSize(-innerWidth).tickFormat(""));

	g.selectAll(".bar")
		.data(displayedData)
		.join("rect")
		.attr("class", "bar")
		.attr("x", (d) => x(d.countryName))
		.attr("y", (d) => y(d.value))
		.attr("width", x.bandwidth())
		.attr("height", (d) => innerHeight - y(d.value))
		.on("mousemove", (event, d) => {
			tooltip
				.style("opacity", 1)
				.style("left", `${event.clientX + 14}px`)
				.style("top", `${event.clientY + 14}px`)
				.html(
					`<strong>${d.countryName}</strong><br>Value: ${formatValue(d.value)} ${d.unit}<br>Year: ${d.year}`
				);
		})
		.on("mouseleave", () => {
			tooltip.style("opacity", 0);
		});

	const xAxis = g
		.append("g")
		.attr("class", "axis")
		.attr("transform", `translate(0, ${innerHeight})`)
		.call(d3.axisBottom(x));

	xAxis
		.selectAll("text")
		.attr("transform", "rotate(-36)")
		.style("text-anchor", "end")
		.attr("dx", "-0.5em")
		.attr("dy", "0.45em");

	g.append("g")
		.attr("class", "axis")
		.call(d3.axisLeft(y).ticks(7).tickFormat(d3.format("~s")));

	g.append("text")
		.attr("x", innerWidth / 2)
		.attr("y", innerHeight + margin.bottom - 14)
		.attr("text-anchor", "middle")
		.attr("fill", "#334953")
		.text("Country");

	g.append("text")
		.attr("transform", "rotate(-90)")
		.attr("x", -innerHeight / 2)
		.attr("y", -margin.left + 15)
		.attr("text-anchor", "middle")
		.attr("fill", "#334953")
		.text("Observation Value");

	updateTransparencyNotes(displayedData.length, yearData.length);
}

function drawLineChart() {
	const series = state.filteredByMeasure
		.filter((d) => d.countryName === state.selectedCountry)
		.filter((d) => d.pollutant && d.pollutant.includes("Greenhouse"))
		.filter((d) => Number.isFinite(d.value))
		.sort((a, b) => a.year - b.year);
	
	console.log("Series length:", series.length);
	console.log("Sample pollutant values:", [...new Set(state.filteredByMeasure.map(d => d.pollutant))]);
	console.log("Pollutant chars:", [...state.filteredByMeasure[0].pollutant].map(c => c.charCodeAt(0)));
	console.log("Filtered pollutants:", [...new Set(series.map(d => d.pollutant))]);

	const dims = getDimensions(svgLine);
	const { width, height, margin } = dims;
	const innerWidth = width - margin.left - margin.right;
	const innerHeight = height - margin.top - margin.bottom;

	svgLine.selectAll("*").remove();

	const g = svgLine
		.append("g")
		.attr("transform", `translate(${margin.left}, ${margin.top})`);

	const x = d3
		.scaleLinear()
		.domain(d3.extent(series, (d) => d.year))
		.range([0, innerWidth]);

	const y = d3
		.scaleLinear()
		.domain([0, d3.max(series, (d) => d.value) || 0])
		.nice()
		.range([innerHeight, 0]);

	g.append("g")
		.attr("class", "grid")
		.call(d3.axisLeft(y).tickSize(-innerWidth).tickFormat(""));

	const lineGen = d3
		.line()
		.x((d) => x(d.year))
		.y((d) => y(d.value));

	g.append("path")
		.datum(series)
		.attr("class", "line-path")
		.attr("d", lineGen);

	g.selectAll(".point")
		.data(series)
		.join("circle")
		.attr("class", "point")
		.attr("r", 3.2)
		.attr("cx", (d) => x(d.year))
		.attr("cy", (d) => y(d.value))
		.on("mousemove", (event, d) => {
			tooltip
				.style("opacity", 1)
				.style("left", `${event.clientX + 14}px`)
				.style("top", `${event.clientY + 14}px`)
				.html(
					`<strong>${d.countryName}</strong><br>Year: ${d.year}<br>Value: ${formatValue(d.value)} ${d.unit}`
				);
		})
		.on("mouseleave", () => {
			tooltip.style("opacity", 0);
		});

	g.append("g")
		.attr("class", "axis")
		.attr("transform", `translate(0, ${innerHeight})`)
		.call(d3.axisBottom(x).ticks(8).tickFormat(d3.format("d")));

	g.append("g")
		.attr("class", "axis")
		.call(d3.axisLeft(y).ticks(7).tickFormat(d3.format("~s")));

	g.append("text")
		.attr("x", innerWidth / 2)
		.attr("y", innerHeight + margin.bottom - 14)
		.attr("text-anchor", "middle")
		.attr("fill", "#334953")
		.text("Year");

	g.append("text")
		.attr("transform", "rotate(-90)")
		.attr("x", -innerHeight / 2)
		.attr("y", -margin.left + 15)
		.attr("text-anchor", "middle")
		.attr("fill", "#334953")
		.text("Observation Value");
}

function updateDataViews() {
	state.filteredByMeasure = state.raw.filter((d) => d.measureLabel === state.selectedMeasure);
	refreshCountryControl();
	drawBarChart();
	drawLineChart();
}

function wireEvents() {
	measureSelect.addEventListener("change", (event) => {
		state.selectedMeasure = event.target.value;

		const years = uniqueSorted(
			state.raw
				.filter((d) => d.measureLabel === state.selectedMeasure)
				.map((d) => d.year),
			true
		);

		yearSelect.innerHTML = "";
		years.forEach((y) => {
			const option = document.createElement("option");
			option.value = String(y);
			option.textContent = String(y);
			yearSelect.appendChild(option);
		});

		state.selectedYear = years[years.length - 1] ? String(years[years.length - 1]) : "";
		yearSelect.value = state.selectedYear;
		updateDataViews();
	});

	yearSelect.addEventListener("change", (event) => {
		state.selectedYear = event.target.value;
		drawBarChart();
	});

	topNSelect.addEventListener("change", (event) => {
		state.selectedTopN = Number(event.target.value);
		drawBarChart();
	});

	countrySelect.addEventListener("change", (event) => {
		state.selectedCountry = event.target.value;
		drawLineChart();
	});

	window.addEventListener("resize", () => {
		drawBarChart();
		drawLineChart();
	});
}

async function init() {
	try {
		const rows = await d3.csv(DATA_PATH);

		state.raw = rows
			.map((d) => ({
				countryCode: d.REF_AREA,
				countryName: d["Reference area"],
				year: readFirstNumericField(d, ["TIME_PERIOD", "Time period"]),
				measureLabel: d.Measure,
				pollutant: d.Pollutant,
				unit: d["Unit of measure"],
				value: readFirstNumericField(d, ["OBS_VALUE", "Observation value"]),
			}))
			.filter((d) => d.countryName && Number.isFinite(d.year));

		if (state.raw.length === 0) {
			showError("No usable rows were found in the CSV file.");
			return;
		}

		buildControls();
		state.selectedCountry = uniqueSorted(
			state.raw
				.filter((d) => d.measureLabel === state.selectedMeasure)
				.map((d) => d.countryName)
		)[0];

		wireEvents();
		updateDataViews();
	} catch (error) {
		showError("Could not load the CSV file. Check that the path and file name are correct.");
		console.error(error);
	}
}

init();

const DATA_PATH = "OECD.ENV.EPI,DSD_AIR_GHG@DF_AIR_GHG,+all.csv";

const svgBar = d3.select("#bar-chart");
const svgLine = d3.select("#line-chart");
const measureSelect = document.getElementById("measure-select");
const yearSelect = document.getElementById("year-select");
const topNSelect = document.getElementById("topn-select");
const biasSelect = document.getElementById("bias-select");
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
	biasMode: "favor-country",
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

function getBiasedMeasures() {
	const measures = uniqueSorted(state.raw.map((d) => d.measureLabel));
	
	if (state.biasMode === "reduce-measures") {
		return measures.filter((_, index) => index % 2 === 0);
	}
	
	if (state.biasMode === "favor-country") {
		// Calculate the selected country's rank for each measure
		const measureStats = measures.map(measure => {
			const measureData = state.raw.filter(d => d.measureLabel === measure && Number.isFinite(d.value));
			
			// Handle edge cases where data might be missing
			if (measureData.length === 0) return { measure, rank: 999999, total: 0 };
			
			// Calculate totals per country for this measure
			const countryTotals = d3.rollup(measureData, v => d3.sum(v, d => d.value), d => d.countryName);
			
			// Sort countries descending to determine rank
			const sortedCountries = Array.from(countryTotals.entries()).sort((a, b) => b[1] - a[1]);
			
			// Find rank (1-based index)
			const rankIndex = sortedCountries.findIndex(d => d[0] === state.selectedCountry);
			const rank = rankIndex !== -1 ? rankIndex + 1 : 999999;
			const total = countryTotals.get(state.selectedCountry) || 0;
			
			return { measure, rank, total };
		});
		
		// Sort by rank (ascending - 1 is best), then by total value (descending) as a tiebreaker
		measureStats.sort((a, b) => {
			if (a.rank !== b.rank) {
				return a.rank - b.rank; 
			}
			return b.total - a.total; 
		});
		
		return measureStats.map(m => m.measure);
	}
	
	return measures;
}

function getBiasedYears(measure) {
	const years = uniqueSorted(
		state.raw
			.filter((d) => d.measureLabel === measure)
			.map((d) => d.year),
		true
	);
	if (state.biasMode === "reduce-years") {
		return years.slice(-5);
	}
	return years;
}

function getBiasedCountries() {
	const countries = uniqueSorted(state.filteredByMeasure.map((d) => d.countryName));
	if (state.biasMode === "limit-countries") {
		return countries.filter((_, index) => index % 3 === 0);
	}
	if (state.biasMode === "favor-country") {
		// Sort to put the currently selected country first, then others
		const selected = state.selectedCountry;
		const sorted = countries.sort((a, b) => {
			if (a === selected) return -1;
			if (b === selected) return 1;
			return a.localeCompare(b);
		});
		return sorted;
	}
	return countries;
}

function buildControls() {
	const measures = getBiasedMeasures();
	measures.forEach((m) => {
		const option = document.createElement("option");
		option.value = m;
		option.textContent = m;
		measureSelect.appendChild(option);
	});

	state.selectedMeasure = measures[0] || "";
	measureSelect.value = state.selectedMeasure;

	updateYearControl();

	state.selectedTopN = Number(topNSelect.value);
}

function updateYearControl() {
	const years = getBiasedYears(state.selectedMeasure);
	yearSelect.innerHTML = "";
	years.forEach((y) => {
		const option = document.createElement("option");
		option.value = String(y);
		option.textContent = String(y);
		yearSelect.appendChild(option);
	});
	state.selectedYear = years[years.length - 1] ? String(years[years.length - 1]) : "";
	yearSelect.value = state.selectedYear;
}

function updateDeceptiveNotes(displayedCount) {
	if (!methodList) {
		return;
	}

	const notes = [
		"Visualization optimized for maximum visual impact and clarity.",
		"Data scales adjusted to emphasize key differences and trends.",
		"Selective data curation applied to highlight most relevant information.",
		`Showing top ${displayedCount} countries for focused analysis.`,
		"Trend data filtered to showcase significant changes over time.",
		state.biasMode === "none"
			? "Bias mode is off."
			: `Bias mode active: ${state.biasMode.replace(/-/g, " ")}.`,
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

	const maxVal = d3.max(displayedData, (d) => d.value) || 0;
	const y = d3
		.scaleLinear()
		.domain([d3.min(displayedData, (d) => d.value) * 0.85, maxVal * 1.02])
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
		.text("Observation Value (Scaled for Impact)");

	updateDeceptiveNotes(displayedData.length);
}

function drawLineChart() {
	let series = state.filteredByMeasure
		.filter((d) => d.countryName === state.selectedCountry)
		.filter((d) => Number.isFinite(d.value))
		.sort((a, b) => a.year - b.year);

	// Black hat: Selective filtering - remove some data points to create misleading trends
	series = series.filter((d, i) => i % 2 === 0); // Keep every other point

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

	// Fix scaling: use a normal linear axis for the trend chart
	const maxSeriesValue = d3.max(series, (d) => d.value) || 0;
	const y = d3
		.scaleLinear()
		.domain([d3.min(series, (d) => d.value) * 0.9, maxSeriesValue * 1.02])
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
		.attr("fill", "none")
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

function refreshCountryControl() {
	const countries = getBiasedCountries();

	const currentValueStillValid = countries.includes(state.selectedCountry);
	if (!currentValueStillValid) {
		if (state.biasMode === "favor-country" && countries.length > 0) {
			state.selectedCountry = countries[0];
		} else {
			state.selectedCountry = countries[0] || "";
		}
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

function updateDataViews() {
	state.filteredByMeasure = state.raw.filter((d) => d.measureLabel === state.selectedMeasure);
	refreshCountryControl();
	drawBarChart();
	drawLineChart();
}

function wireEvents() {
	measureSelect.addEventListener("change", (event) => {
		state.selectedMeasure = event.target.value;
		updateYearControl();
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

	biasSelect.addEventListener("change", (event) => {
		state.biasMode = event.target.value;

		const measures = getBiasedMeasures();
		
		// Force select the country's best measure when switching to favor-country mode
		if (state.biasMode === "favor-country") {
			state.selectedMeasure = measures[0] || "";
		} else if (!measures.includes(state.selectedMeasure)) {
			state.selectedMeasure = measures[0] || "";
		}

		measureSelect.innerHTML = "";
		measures.forEach((m) => {
			const option = document.createElement("option");
			option.value = m;
			option.textContent = m;
			measureSelect.appendChild(option);
		});
		measureSelect.value = state.selectedMeasure;

		updateYearControl();
		updateDataViews();
	});

	countrySelect.addEventListener("change", (event) => {
		state.selectedCountry = event.target.value;
		
		if (state.biasMode === "favor-country") {
			// Rebuild measures based on the new country's best performance
			const measures = getBiasedMeasures();
			
			// Automatically switch the measure to the one they perform best in
			state.selectedMeasure = measures[0] || "";
			
			measureSelect.innerHTML = "";
			measures.forEach((m) => {
				const option = document.createElement("option");
				option.value = m;
				option.textContent = m;
				measureSelect.appendChild(option);
			});
			measureSelect.value = state.selectedMeasure;
			
			updateYearControl();
			updateDataViews();
		} else {
			drawLineChart();
		}
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

		biasSelect.value = state.biasMode;
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
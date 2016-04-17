#!/usr/bin/env node
"use strict";


var fs = require('fs');
var path = require("path");
var colors = require('colors');
var moment = require('moment');
var opening_hours = require('opening_hours');


var DIR_PATH = "./cities/";

var MAX_LATITUDE = 90.0;
var MIN_LATITUDE = -90.0;
var MAX_LONGITUDE = 180.0;
var MIN_LONGITUDE = -180.0;

var exitCode = 0;


colors.setTheme({
	section: 'blue',
	market: 'yellow',
	passed: 'green',
	error: 'red'
});


fs.readdir(DIR_PATH, function (err, files) {
    if (err) {
        throw err;
    }

    files.map(function(file) {
        return path.join(DIR_PATH, file);
    }).filter(function(file) {
        return fs.statSync(file).isFile();
    }).forEach(function(file) {
        console.log("\n===> Validating %s ...".section, file);
        var marketValidator = new MarketValidator(file);
        marketValidator.validate();
        console.log("\n");
    });

    process.exit(exitCode);
});


function MarketValidator(file) {

	this.file = file;
	this.errorsCount = 0;
	this.warningsCount = 0;

	this.validate = function() {
		var data = fs.readFileSync(this.file, 'utf8');
		var json = JSON.parse(data);
		var features = json.features;
		var cityName = this.getCityName();

		var featuresValidator = new FeaturesValidator(features, cityName);
		featuresValidator.validate();
		featuresValidator.printIssues();
		this.errorsCount += featuresValidator.getErrorsCount();
		this.warningsCount += featuresValidator.getWarningsCount();

		var metadataValidator = new MetadataValidator(json.metadata);
		metadataValidator.validate();
		metadataValidator.printWarnings();
		metadataValidator.printErrors();
		this.errorsCount += metadataValidator.getErrorsCount();
		this.warningsCount += metadataValidator.getWarningsCount();

		this.printSummary();
	};

	this.getCityName = function() {
		return path.basename(this.file, path.extname(this.file));
	};


	this.printSummary = function() {
		if (this.errorsCount === 0) {
			this.printSuccess();

		} else {
			this.printFailure();
			exitCode = 1;
		}
	};

	this.printSuccess = function() {
		if (this.warningsCount === 0) {
			console.log("\nValidation PASSED without warnings or errors.".passed);
		} else {
			console.log("\nValidation PASSED with %d warning(s) and no errors.".passed, this.warningsCount);
		}
	};

	this.printFailure = function() {
		console.log("\nValidation done. %d warning(s), %d error(s) detected.".error, this.warningsCount, this.errorsCount);
	};

}


function FeaturesValidator(features, cityName) {

	this.features = features;
	this.cityName = cityName;
	this.errorsCount = 0;
	this.warningsCount = 0;
	this.featureValidators = [];

	this.validate = function() {
		for (var i = 0, length = features.length; i < length; ++i) {
			var feature = features[i];
			this.validateFeature(feature);
		}
	};

	this.validateFeature = function(feature) {
		var featureValidator = new FeatureValidator(feature, this.cityName);
		featureValidator.validate();
		if (featureValidator.hasErrors()) {
			this.errorsCount += featureValidator.getErrorsCount();
		}
		if (featureValidator.hasWarnings()) {
			this.warningsCount += featureValidator.getWarningsCount();
		}
		this.featureValidators.push(featureValidator);
	};

	this.getErrorsCount = function() {
		return this.errorsCount;
	};

	this.getWarningsCount = function() {
		return this.warningsCount;
	};

	this.printIssues = function() {
		for (var i = 0, length = this.featureValidators.length; i < length; ++i) {
			var featureValidator = this.featureValidators[i];
			featureValidator.printWarnings();
			featureValidator.printErrors();
		}
	};

}


function FeatureValidator(feature, cityName) {

	this.feature = feature;
	this.cityName = cityName;
	this.errors = [];
	this.warnings = [];

	this.validate = function() {
		var feature = this.feature;
		if (feature === undefined) {
			this.errors.push(new CustomIssue("Feature cannot be undefined."));
		} else if (feature === null) {
			this.errors.push(new CustomIssue("Feature cannot be null."));
		} else if (feature === {}) {
			this.errors.push(new CustomIssue("Feature cannot be an empty object."));
		} else {
			this.validateGeometry(feature.geometry);
			this.validateProperties(feature.properties);
			this.validateType(feature.type);
		}

	};

	this.validateProperties = function(properties) {
		if (properties === undefined) {
			this.errors.push(new UndefinedFieldIssue("properties"));
		} else if (properties === null) {
			this.errors.push(new NullFieldIssue("properties"));
		} else if (properties === {}) {
			this.errors.push(new EmptyObjectIssue("properties"));
		} else {
			this.validateTitle(properties.title);
			this.validateLocation(properties.location);
			var openingHours = properties.opening_hours;
			var openingHoursUnclassified = properties.opening_hours_unclassified;
			if (openingHours === null) {
				this.validateOpeningHoursIsNull(openingHours);
				this.validateOpeningHoursUnclassifiedIsNotNull(openingHoursUnclassified);
			} else {
				this.validateOpeningHours(openingHours);
				this.validateOpeningHoursUnclassifiedIsNull(openingHoursUnclassified);
			}
		}
	};

	this.validateTitle = function(title) {
		if (title === undefined) {
			this.errors.push(new UndefinedFieldIssue("title"));
		} else if (title === null) {
			this.errors.push(new NullFieldIssue("title"));
		} else if (title.length === 0) {
			this.errors.push(new EmptyFieldIssue("title"));
		}
	};

	this.validateLocation = function(location) {
		if (location === undefined) {
			this.errors.push(new UndefinedFieldIssue("location"));
		} else if (location === null) {
			this.warnings.push(new NullFieldIssue("location"));
		} else if (location.length === 0) {
			this.warnings.push(new EmptyFieldIssue("location"));
		}
	};

	this.validateOpeningHours = function(openingHours) {
		if (openingHours === undefined) {
			this.errors.push(new UndefinedFieldIssue("opening_hours"));
			return;
		}
		var oh;
		try {
			oh = new opening_hours(openingHours);
			this.errors.concat(oh.getWarnings());
		} catch (error) {
			this.errors.push(error.toString());
		}
	};

	this.validateOpeningHoursIsNull = function(openingHours) {
		if (openingHours !== null) {
			this.errors.push(new CustomIssue(
				"Field 'opening_hours' must be null when 'opening_hours_unclassified' is used."));
		}
	};

	this.validateOpeningHoursUnclassifiedIsNull = function(openingHoursUnclassified) {
		if (openingHoursUnclassified === undefined) {
			// Field "opening_hours_unclassified" is optional.
			return;
		}
		if (openingHoursUnclassified !== null) {
			this.errors.push(new CustomIssue(
				"Field 'opening_hours_unclassified' must be null when 'opening_hours' is used."));
		}
	};

	this.validateOpeningHoursUnclassifiedIsNotNull = function(openingHoursUnclassified) {
		if (openingHoursUnclassified === undefined) {
			this.errors.push(new CustomIssue(
				"Field 'opening_hours_unclassified' cannot be undefined when 'opening_hours' is null."));
		} else if (openingHoursUnclassified === null) {
			this.errors.push(new CustomIssue(
				"Field 'opening_hours_unclassified' cannot be null when 'opening_hours' is null."));
		} else if (openingHoursUnclassified === "") {
			this.errors.push(new CustomIssue(
				"Field 'opening_hours_unclassified' cannot be empty when 'opening_hours' is null."));
		}
	};

	this.validateGeometry = function(geometry) {
		if (geometry === undefined) {
			this.errors.push(new UndefinedFieldIssue("geometry"));
		} else if (geometry === null) {
			this.errors.push(new NullFieldIssue("geometry"));
		} else if (geometry === {}) {
			this.errors.push(new EmptyObjectIssue("geometry"));
		} else {
			this.validateCoordinates(geometry.coordinates);
			this.validateGeometryType(geometry.type);
		}
	};

	this.validateCoordinates = function(coordinates) {
		if (coordinates === undefined) {
			this.errors.push(new UndefinedFieldIssue("coordinates"));
		} else if (coordinates === null) {
			this.errors.push(new NullFieldIssue("coordinates"));
		} else if (coordinates.length !== 2) {
			this.errors.push(new CustomIssue(
				"Field 'coordinates' must contain two values not " + coordinates.length + "."));
		} else {
			var lon = coordinates[0];
			if (!longitudeInValidRange(lon)) {
				this.errors.push(new LongitudeRangeExceedanceIssue("coordinates[0]", lon));
			}
			var lat = coordinates[1];
			if (!latitudeInValidRange(lat)) {
				this.errors.push(new LatitudeRangeExceedanceIssue("coordinates[1]", lat));
			}
		}
	};

	this.validateGeometryType = function(type) {
		if (type !== "Point") {
			this.errors.push(new CustomIssue(
				"Field 'geometry.type' must be 'Point' not '" + type + "'."));
		}
	};

	this.validateType = function(type) {
		if (type !== "Feature") {
			this.errors.push(new CustomIssue(
				"Field 'type' must be 'Feature' not '" + type + "'."));
		}
	};

	this.getErrorsCount = function() {
		return this.errors.length;
	};

	this.getWarningsCount = function() {
		return this.warnings.length;
	};

	this.hasErrors = function() {
		return this.errors.length > 0;
	};

	this.hasWarnings = function() {
		return this.warnings.length > 0;
	};

	this.printMarketTitle = function() {
		console.log("\n%s: %s".market,
			this.cityName.toUpperCase(),
			this.feature.properties.title);
	};

	this.printErrors = function() {
		if (this.hasErrors()) {
			this.printMarketTitle();
		}
		for (var i = 0, length = this.errors.length; i < length; ++i) {
			var error = this.errors[i];
			console.log("Error: %s", error.toString());
		}
	};

	this.printWarnings = function() {
		for (var i = 0, length = this.warnings.length; i < length; ++i) {
			var warning = this.warnings[i];
			console.log("Warning: %s", warning.toString());
		}
	};

}


function MetadataValidator(metadata) {

	this.metadata = metadata;
	this.errors = [];
	this.warnings = [];

	this.validate = function() {
		var metadata = this.metadata;
		if (metadata === undefined) {
			this.errors.push(new UndefinedFieldIssue("metadata"));
		} else if (metadata === null) {
			this.errors.push(new NullFieldIssue("metadata"));
		} else {
			this.validateDataSource(metadata.data_source);
		}
	};

	this.validateDataSource = function(dataSource) {
		if (dataSource === undefined) {
			this.errors.push(new UndefinedFieldIssue("data_source"));
		} else if (dataSource === null) {
			this.errors.push(new NullFieldIssue("data_source"));
		} else {
			this.validateTitle(dataSource.title);
			this.validateUrl(dataSource.url);
		}
	};

	this.validateTitle = function(title) {
		if (title === undefined) {
			this.errors.push(new UndefinedFieldIssue("title"));
		} else if (title === null) {
			this.errors.push(new NullFieldIssue("title"));
		} else if (title.length === 0) {
			this.errors.push(new EmptyFieldIssue("title"));
		}
	};

	this.validateUrl = function(url) {
		if (url === undefined) {
			this.errors.push(new UndefinedFieldIssue("url"));
		} else if (url === null) {
			this.errors.push(new NullFieldIssue("url"));
		} else if (url.length === 0) {
			this.errors.push(new EmptyFieldIssue("url"));
		}
	};

	this.validateMapInitialization = function(mapInitialization) {
		if (mapInitialization === undefined) {
			this.errors.push(new UndefinedFieldIssue("map_initialization"));
		} else if (mapInitialization === null) {
			this.errors.push(new NullFieldIssue("map_initialization"));
		} else {
			this.validateCoordinates(mapInitialization.coordinates);
			this.validateZoomLevel(mapInitialization.zoom_level);
		}
	};

	this.validateCoordinates = function(coordinates) {
		if (coordinates === undefined) {
			this.errors.push(new UndefinedFieldIssue("coordinates"));
		} else if (coordinates === null) {
			this.errors.push(new NullFieldIssue("coordinates"));
		} else if (coordinates.length === 2) {
			this.errors.push(
				"Field 'coordinates' must contain two values not " + coordinates.length + ".");
		} else {
			var lon = coordinates[0];
			if (!longitudeInValidRange(lon)) {
				this.errors.push(new LongitudeRangeExceedanceIssue("coordinates[0]", lon));
			}
			var lat = coordinates[1];
			if (!latitudeInValidRange(lat)) {
				this.errors.push(new LatitudeRangeExceedanceIssue("coordinates[1]", lat));
			}
		}
	};

	this.validateZoomLevel = function(zoomLevel) {
		if (zoomLevel === undefined) {
			this.errors.push(new UndefinedFieldIssue("zoom_level"));
		} else if (zoomLevel === null) {
			this.errors.push(new NullFieldIssue("zoom_level"));
		} else if (zoomLevel < 1 || zoomLevel > 18) {
			this.errors.push(new RangeExceedanceIssue("zoom_level", 1, 18, zoomLevel));
		}
	};

	this.getErrorsCount = function() {
		return this.errors.length;
	};

	this.getWarningsCount = function() {
		return this.warnings.length;
	};

	this.hasErrors = function() {
		return this.errors.length > 0;
	};

	this.hasWarnings = function() {
		return this.warnings.length > 0;
	};

	this.printErrors = function() {
		for (var i = 0, length = this.errors.length; i < length; ++i) {
			var error = this.errors[i];
			console.log(error.toString());
		}
	};

	this.printWarnings = function() {
		for (var i = 0, length = this.warnings.length; i < length; ++i) {
			var warning = this.warnings[i];
			console.log(warning.toString());
		}
	};

}


function latitudeInValidRange(lat) {
    return (lat > MIN_LATITUDE && lat <= MAX_LATITUDE);
}

function longitudeInValidRange(lon) {
    return (lon > MIN_LONGITUDE && lon <= MAX_LONGITUDE);
}


function CustomIssue(message) {

	this.message = message;

	this.toString = function() {
		return this.message;
	};
}

function UndefinedFieldIssue(fieldName) {

	this.fieldName = fieldName;

	this.toString = function() {
		return "Field '" + this.fieldName + "' cannot be undefined.";
	};
}


function NullFieldIssue(fieldName) {

	this.fieldName = fieldName;

	this.toString = function() {
		return "Field '" + this.fieldName + "' cannot be null.";
	};
}

function EmptyFieldIssue(fieldName) {

	this.fieldName = fieldName;

	this.toString = function() {
		return "Field '" + this.fieldName + "' cannot be empty.";
	};
}

function EmptyObjectIssue(fieldName) {

	this.fieldName = fieldName;

	this.toString = function() {
		return "Field '" + this.fieldName + "' cannot be an empty object.";
	};
}

function LatitudeRangeExceedanceIssue(fieldName, actual) {
	return new RangeExceedanceIssue(fieldName, MIN_LATITUDE, MAX_LATITUDE, actual);
}

function LongitudeRangeExceedanceIssue(fieldName, actual) {
	return new RangeExceedanceIssue(fieldName, MIN_LONGITUDE, MAX_LONGITUDE, actual);
}

function RangeExceedanceIssue(fieldName, min, max, actual) {

	this.fieldName = fieldName;
	this.min = min;
	this.max = max;
	this.actual = actual;

	this.toString = function() {
		return "Field '" + this.fieldName + "' exceeds valid range of [" +
		this.min + ":" + this.max + "]. Actual value is " + this.actual + ".";
	};
}

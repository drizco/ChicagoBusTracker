const routeMap = require('./data/routesWithKeywords_4');
const allRoutesLowerCase = require('./data/allRoutesLowerCase');
const helpers = require('./helpers');
const moment = require('moment');

// deployment command
// gcloud beta functions deploy dialogflowFirebaseFulfillment --stage-bucket chicagobustracker --trigger-http

exports.dialogflowFirebaseFulfillment = (req, res) => {
  let response = 'This is a sample response from your webhook!';
  const { route, stops, direction } = req.body.result.parameters;
  const stopIds = getStopId(route, stops, direction);
  switch (stopIds.length) {
    case 0:
      response = 'I couldn\'t find your stop';
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify({
        speech: response, displayText: response
      }));
      break;
    case 1:
      const stopId = stopIds[0];
      helpers.getArrivals(stopId, route)
        .then(arrivals => {
          response = formatText(arrivals);
          res.setHeader('Content-Type', 'application/json');
          res.send(JSON.stringify({
            speech: response, displayText: response
          }));
        });
      break;
    default:
      response = `Which stop? ${stopIds.map(id => allRoutesLowerCase[route][direction][id]).join(' or ')}?`;
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify({
        speech: response, displayText: response
      }));
  }
};

function getStopId(route, stopKeywords, direction) {
  const stopIds = stopKeywords.map(keyword => {
    const stopId = routeMap[route][direction][keyword];
    return stopId || null;
  }).filter((id, index, self) => self.indexOf(id) === index && id !== null);
  return stopIds;
}

function formatWithMinutes(arrival) {
  return arrival == '1' ? `${arrival} minute` : `${arrival} minutes`;
}

function calculateDelay(arrival) {
  return moment(arrival.prdtm, 'YYYYMMDD HH:mm').diff(moment(arrival.tmstmp, 'YYYYMMDD HH:mm'), 'm').toString();
}

function convertToMinutes(arrivals) {
  return arrivals.map((arrival, i) => {
    let response = '';
    if (i === arrivals.length - 1) {
      response = 'and ';
    }
    if (arrival.prdctdn.toLowerCase() === 'dly') {
      response += formatWithMinutes(calculateDelay(arrival));
    } else if (arrival.prdctdn.toLowerCase() === 'due') {
      response += '1 minute';
    } else {
      response += formatWithMinutes(arrival.prdctdn);
    }
    return response;
  }).join(', ');
}

function formatArrivals(arrivals) {
  const first = arrivals[0];
  const rest = arrivals.slice(1);
  const stopName = first.stpnm;
  let response = rest.length
    ? `${handleFirstBus(first, stopName)} ${handleRestOfBuses(rest)}`
    : `${handleFirstBus(first, stopName)} It\'s the last one coming for a while.`;
  response += responseEnding();
  return response;
}

function responseEnding() {
  const responses = [
    ' You can ask for an update or track another bus.',
    ' Anything else?',
    ' Can I track another bus for you?',
    ' I\'ll keep listening in case you need an update',
    ' What else can I do for you?',
    ' Let me know if you need more help.',
    ' Can I help with another bus?',
    ' Is there anything else I can help with?',
    ' If you want an update on your bus, let me know.',
    ' What else can I help you with?'
  ];
  const index = Math.floor(Math.random() * responses.length);
  return responses[index];
}

function handleFirstBus(arrival, stopName) {
  if (arrival.prdctdn.toLowerCase() === 'due') {
    return `Hurry! The next bus is due to arrive at ${stopName}.`;
  }
  if (arrival.prdctdn.toLowerCase() === 'dly') {
    return `The next bus is delayed, but it\'s estimated to arrive at ${stopName} in ${formatWithMinutes(calculateDelay(arrival))}.`;
  }
  return `The next bus is arriving at ${stopName} in ${formatWithMinutes(arrival.prdctdn)}.`;
}

function handleRestOfBuses(arrivals) {
  if (arrivals.length === 1) {
    const time = arrivals[0].prdctdn.toLowerCase();
    if (time === 'due') {
      return 'The one after that is due too!';
    }
    if (time === 'dly') {
      return `The bus after that is delayed, but it's estimated to arrive in ${formatWithMinutes(calculateDelay(arrivals[0]))}.`;
    }
    return `The bus after that is coming in ${formatWithMinutes(time)}.`;
  }
  return `After that buses are arriving in ${convertToMinutes(arrivals)}.`;
}

function handleError(arrivalsObj) {
  const route = arrivalsObj.error[0].rt;
  const bool = arrivalsObj.error[0].msg === 'No arrival times';
  let response = bool ?
    'There are no upcoming arrivals'
    :
    'There is no scheduled service';
  if (route) {
    response += ` for route ${route}`;
  }
  return `${response}.`;
}

function formatText(arrivals) {
  if (arrivals.error) {
    return handleError(arrivals);
  }
  return formatArrivals(arrivals.prd);
}


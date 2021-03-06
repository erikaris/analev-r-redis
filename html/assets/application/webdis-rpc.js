function uuid() {
    var seed = Date.now();
    if (window.performance && typeof window.performance.now === "function") {
        seed += performance.now();
    }

    var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = (seed + Math.random() * 16) % 16 | 0;
        seed = Math.floor(seed/16);

        return (c === 'x' ? r : r & (0x3|0x8)).toString(16);
    });

    return uuid;
}

function ajax_get(url, success, fail) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.onload = function() {
        if (xhr.status === 200) {
            resp = JSON.parse(xhr.responseText);
            if (success) success(resp, xhr.responseURL);
        } else {
            fail(xhr.responseText);
        }
    };
    xhr.send();
}

function ajax_post(url, json_data, success, fail) {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    xhr.onload = function() {
        if (xhr.status === 200) {
            resp = JSON.parse(xhr.responseText);
            if (success) success(resp);
        } else {
            fail(xhr.responseText);
        }
    };
    xhr.send($.param(json_data));
}

function _send_cmd_request(req_id, cmd, callback) {
    message = JSON.stringify({
        'sess': window.session_id, 'id': req_id, 'cmd': cmd 
    });

    ajax_get(window.webdis_url + '/LPUSH/req/' + encodeURIComponent(message), function (j_resp, s_url) {
        var parts = s_url.split('/'), 
            data = parts[parts.length-1], 
            data = decodeURIComponent(data), 
            data = JSON.parse(data), 
            req_id = data.id;

        Object.keys(j_resp).forEach(function (op) {
            var val = parseInt(j_resp[op]);
            if (val <= 0) {
                console.log(req_id, 'Command failed to execute')
            } else {
                callback(req_id, s_url);
            }
        });
    });
}

function _send_rpc_request(req_id, func_name, params, callback) {
    message = JSON.stringify({
        'sess': window.session_id, 'id': req_id, 'func': func_name, 'args': params
    });

    ajax_get(window.webdis_url + '/LPUSH/req/' + encodeURIComponent(message), function (j_resp, s_url) {
        var parts = s_url.split('/'), 
            data = parts[parts.length-1], 
            data = decodeURIComponent(data), 
            data = JSON.parse(data), 
            req_id = data.id;

        Object.keys(j_resp).forEach(function (op) {
            var val = parseInt(j_resp[op]);
            if (val <= 0) {
                console.log(req_id, 'Command failed to execute')
            } else {
                callback(req_id, s_url);
            }
        });
    });
}

function _wait_for_response(req_id) {
    ajax_get(window.webdis_url + '/BRPOP/resp-' + req_id + '/timeout/30', function (j_resp, s_url) {
        var parts = s_url.split('/'), 
            req_id = parts.filter(function (part) {
                if (part.includes('resp-')) return true;
                return false;
            })[0].replace('resp-', '');

        Object.keys(j_resp).forEach(function (op) {
            var resp = j_resp[op];
            if (resp == null) {
                console.log(req_id, 'Timeout. Retrying...');
                _wait_for_response(req_id);
            } else {
                if(req_id in window.req_callbacks) {
                    var req_url = null;
                    if (req_id in window.req_urls) req_url = window.req_urls[req_id];

                    window.req_callbacks[req_id](req_id, resp[1], req_url, s_url);

                    delete window.req_callbacks[req_id];
                    if (req_id in window.req_urls) delete window.req_urls[req_id];
                }
            }
        });
    });
}

window.analev_eval = function(cmd, callback, req_id = uuid()) {
    if (! ('req_callbacks' in window)) window.req_callbacks = {};
    if (! ('req_urls' in window)) window.req_urls = {};
    if (callback) window.req_callbacks[req_id] = callback;

    _send_cmd_request(req_id, cmd, function(_req_id, _req_url) {        
        if (_req_url) window.req_urls[_req_id] = _req_url;
        _wait_for_response(_req_id);
    });
}

window.analev_call = function(func_name, json_params=[], callback, req_id = uuid()) {
    if (! ('req_callbacks' in window)) window.req_callbacks = {};
    if (! ('req_urls' in window)) window.req_urls = {};
    if (callback) window.req_callbacks[req_id] = callback;

    _send_rpc_request(req_id, func_name, json_params, function(_req_id, _req_url) {
        if (_req_url) window.req_urls[_req_id] = _req_url;
        _wait_for_response(_req_id);
    });
}

window.eval_file = function(filename, params, callback) { 
  // Ensure all values is string
  Object.keys(params).forEach((k) => {
    params[k] = params[k] + "";
  });

  analev_call('module.file.name.eval', [filename, params], function(_req_id, resp) {
    var resp = JSON.parse(resp);
    if (resp.success) {
      if (callback) {
        callback(resp.data.text);
      }
    } else {
      if (callback) {
        callback(resp.data.toString());
      }
    }
  });
}

window.authenticate = function(email, password, callback) {
  analev_call('user.authenticate', {
      email: email, 
      password: password
    }, 
    (reqid, resp) => {
      var resp = JSON.parse(resp);
      if (resp.success) {
        if (callback) callback(resp.data, new Date(Date.now() + 2*60*60*1000))
      } else {
        console.log(resp.message)
      }
    }
  ); 
}
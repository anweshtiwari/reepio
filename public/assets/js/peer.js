/*! peerjs.js build:0.3.8, development. Copyright(c) 2013 Michelle Bu <michelle@michellebu.com> */
(function(exports){
    /**
     * EventEmitter class
     * Creates an object with event registering and firing methods
     */
    function EventEmitter() {
        // Initialise required storage variables
        this._events = {};
    }

    var isArray = Array.isArray;


    EventEmitter.prototype.addListener = function(type, listener, scope, once) {
        if ('function' !== typeof listener) {
            throw new Error('addListener only takes instances of Function');
        }

        // To avoid recursion in the case that type == "newListeners"! Before
        // adding it to the listeners, first emit "newListeners".
        this.emit('newListener', type, typeof listener.listener === 'function' ?
            listener.listener : listener);

        if (!this._events[type]) {
            // Optimize the case of one listener. Don't need the extra array object.
            this._events[type] = listener;
        } else if (isArray(this._events[type])) {

            // If we've already got an array, just append.
            this._events[type].push(listener);

        } else {
            // Adding the second element, need to change to array.
            this._events[type] = [this._events[type], listener];
        }
        return this;
    };

    EventEmitter.prototype.on = EventEmitter.prototype.addListener;

    EventEmitter.prototype.once = function(type, listener, scope) {
        if ('function' !== typeof listener) {
            throw new Error('.once only takes instances of Function');
        }

        var self = this;
        function g() {
            self.removeListener(type, g);
            listener.apply(this, arguments);
        };

        g.listener = listener;
        self.on(type, g);

        return this;
    };

    EventEmitter.prototype.removeListener = function(type, listener, scope) {
        if ('function' !== typeof listener) {
            throw new Error('removeListener only takes instances of Function');
        }

        // does not use listeners(), so no side effect of creating _events[type]
        if (!this._events[type]) return this;

        var list = this._events[type];

        if (isArray(list)) {
            var position = -1;
            for (var i = 0, length = list.length; i < length; i++) {
                if (list[i] === listener ||
                    (list[i].listener && list[i].listener === listener))
                {
                    position = i;
                    break;
                }
            }

            if (position < 0) return this;
            list.splice(position, 1);
            if (list.length == 0)
                delete this._events[type];
        } else if (list === listener ||
            (list.listener && list.listener === listener))
        {
            delete this._events[type];
        }

        return this;
    };


    EventEmitter.prototype.off = EventEmitter.prototype.removeListener;


    EventEmitter.prototype.removeAllListeners = function(type) {
        if (arguments.length === 0) {
            this._events = {};
            return this;
        }

        // does not use listeners(), so no side effect of creating _events[type]
        if (type && this._events && this._events[type]) this._events[type] = null;
        return this;
    };

    EventEmitter.prototype.listeners = function(type) {
        if (!this._events[type]) this._events[type] = [];
        if (!isArray(this._events[type])) {
            this._events[type] = [this._events[type]];
        }
        return this._events[type];
    };

    EventEmitter.prototype.emit = function(type) {
        var type = arguments[0];
        var handler = this._events[type];
        if (!handler) return false;

        if (typeof handler == 'function') {
            switch (arguments.length) {
                // fast cases
                case 1:
                    handler.call(this);
                    break;
                case 2:
                    handler.call(this, arguments[1]);
                    break;
                case 3:
                    handler.call(this, arguments[1], arguments[2]);
                    break;
                // slower
                default:
                    var l = arguments.length;
                    var args = new Array(l - 1);
                    for (var i = 1; i < l; i++) args[i - 1] = arguments[i];
                    handler.apply(this, args);
            }
            return true;

        } else if (isArray(handler)) {
            var l = arguments.length;
            var args = new Array(l - 1);
            for (var i = 1; i < l; i++) args[i - 1] = arguments[i];

            var listeners = handler.slice();
            for (var i = 0, l = listeners.length; i < l; i++) {
                listeners[i].apply(this, args);
            }
            return true;
        } else {
            return false;
        }
    };

    exports.RTCSessionDescription = window.mozRTCSessionDescription || window.RTCSessionDescription;
    exports.RTCPeerConnection = window.mozRTCPeerConnection || window.webkitRTCPeerConnection || window.RTCPeerConnection;
    exports.RTCIceCandidate = window.mozRTCIceCandidate || window.RTCIceCandidate;
    var defaultConfig = {'iceServers': [{ 'url': 'stun:stun.l.google.com:19302' }]};
    var dataCount = 1;

    var util = {
        noop: function() {},

        CLOUD_HOST: '0.peerjs.com',
        CLOUD_PORT: 9000,

        // Browsers that need chunking:
        chunkedBrowsers: {'Chrome': 1},
        chunkedMTU: 16300, // The original 60000 bytes setting does not work when sending data from Firefox to Chrome, which is "cut off" after 16384 bytes and delivered individually.

        // Logging logic
        logLevel: 0,
        setLogLevel: function(level) {
            var debugLevel = parseInt(level, 10);
            if (!isNaN(parseInt(level, 10))) {
                util.logLevel = debugLevel;
            } else {
                // If they are using truthy/falsy values for debug
                util.logLevel = level ? 3 : 0;
            }
            util.log = util.warn = util.error = util.noop;
            if (util.logLevel > 0) {
                util.error = util._printWith('ERROR');
            }
            if (util.logLevel > 1) {
                util.warn = util._printWith('WARNING');
            }
            if (util.logLevel > 2) {
                util.log = util._print;
            }
        },
        setLogFunction: function(fn) {
            if (fn.constructor !== Function) {
                util.warn('The log function you passed in is not a function. Defaulting to regular logs.');
            } else {
                util._print = fn;
            }
        },

        _printWith: function(prefix) {
            return function() {
                var copy = Array.prototype.slice.call(arguments);
                copy.unshift(prefix);
                util._print.apply(util, copy);
            };
        },
        _print: function () {
            var err = false;
            var copy = Array.prototype.slice.call(arguments);
            copy.unshift('PeerJS: ');
            for (var i = 0, l = copy.length; i < l; i++){
                if (copy[i] instanceof Error) {
                    copy[i] = '(' + copy[i].name + ') ' + copy[i].message;
                    err = true;
                }
            }
            err ? console.error.apply(console, copy) : console.log.apply(console, copy);
        },
        //

        // Returns browser-agnostic default config
        defaultConfig: defaultConfig,
        //

        // Returns the current browser.
        browser: (function() {
            if (window.mozRTCPeerConnection) {
                return 'Firefox';
            } else if (window.webkitRTCPeerConnection) {
                return 'Chrome';
            } else if (window.RTCPeerConnection) {
                return 'Supported';
            } else {
                return 'Unsupported';
            }
        })(),
        //

        // Lists which features are supported
        supports: (function() {
            if (typeof RTCPeerConnection === 'undefined') {
                return {};
            }

            var data = true;
            var audioVideo = true;

            var binaryBlob = false;
            var sctp = false;
            var onnegotiationneeded = !!window.webkitRTCPeerConnection;

            var pc, dc;
            try {
                pc = new RTCPeerConnection(defaultConfig, {optional: [{RtpDataChannels: true}]});
            } catch (e) {
                data = false;
                audioVideo = false;
            }

            if (data) {
                try {
                    dc = pc.createDataChannel('_PEERJSTEST');
                } catch (e) {
                    data = false;
                }
            }

            if (data) {
                // Binary test
                try {
                    dc.binaryType = 'blob';
                    binaryBlob = true;
                } catch (e) {
                }

                // Reliable test.
                // Unfortunately Chrome is a bit unreliable about whether or not they
                // support reliable.
                var reliablePC = new RTCPeerConnection(defaultConfig, {});
                try {
                    var reliableDC = reliablePC.createDataChannel('_PEERJSRELIABLETEST', {});
                    sctp = reliableDC.reliable;
                } catch (e) {
                }
                reliablePC.close();
            }

            // FIXME: not really the best check...
            if (audioVideo) {
                audioVideo = !!pc.addStream;
            }

            // FIXME: this is not great because in theory it doesn't work for
            // av-only browsers (?).
            if (!onnegotiationneeded && data) {
                // sync default check.
                var negotiationPC = new RTCPeerConnection(defaultConfig, {optional: [{RtpDataChannels: true}]});
                negotiationPC.onnegotiationneeded = function() {
                    onnegotiationneeded = true;
                    // async check.
                    if (util && util.supports) {
                        util.supports.onnegotiationneeded = true;
                    }
                };
                var negotiationDC = negotiationPC.createDataChannel('_PEERJSNEGOTIATIONTEST');

                setTimeout(function() {
                    negotiationPC.close();
                }, 1000);
            }

            if (pc) {
                pc.close();
            }

            return {
                audioVideo: audioVideo,
                data: data,
                binaryBlob: binaryBlob,
                binary: sctp, // deprecated; sctp implies binary support.
                reliable: sctp, // deprecated; sctp implies reliable data.
                sctp: sctp,
                onnegotiationneeded: onnegotiationneeded
            };
        }()),
        //

        // Ensure alphanumeric ids
        validateId: function(id) {
            // Allow empty ids
            return !id || /^[A-Za-z0-9]+(?:[ _-][A-Za-z0-9]+)*$/.exec(id);
        },

        validateKey: function(key) {
            // Allow empty keys
            return !key || /^[A-Za-z0-9]+(?:[ _-][A-Za-z0-9]+)*$/.exec(key);
        },


        debug: true,

        inherits: function(ctor, superCtor) {
            ctor.super_ = superCtor;
            ctor.prototype = Object.create(superCtor.prototype, {
                constructor: {
                    value: ctor,
                    enumerable: false,
                    writable: true,
                    configurable: true
                }
            });
        },
        extend: function(dest, source) {
            for(var key in source) {
                if(source.hasOwnProperty(key)) {
                    dest[key] = source[key];
                }
            }
            return dest;
        },

        log: function () {
            if (util.debug) {
                var err = false;
                var copy = Array.prototype.slice.call(arguments);
                copy.unshift('PeerJS: ');
                for (var i = 0, l = copy.length; i < l; i++){
                    if (copy[i] instanceof Error) {
                        copy[i] = '(' + copy[i].name + ') ' + copy[i].message;
                        err = true;
                    }
                }
                err ? console.error.apply(console, copy) : console.log.apply(console, copy);
            }
        },

        setZeroTimeout: (function(global) {
            var timeouts = [];
            var messageName = 'zero-timeout-message';

            // Like setTimeout, but only takes a function argument.	 There's
            // no time argument (always zero) and no arguments (you have to
            // use a closure).
            function setZeroTimeoutPostMessage(fn) {
                timeouts.push(fn);
                global.postMessage(messageName, '*');
            }

            function handleMessage(event) {
                if (event.source == global && event.data == messageName) {
                    if (event.stopPropagation) {
                        event.stopPropagation();
                    }
                    if (timeouts.length) {
                        timeouts.shift()();
                    }
                }
            }
            if (global.addEventListener) {
                global.addEventListener('message', handleMessage, true);
            } else if (global.attachEvent) {
                global.attachEvent('onmessage', handleMessage);
            }
            return setZeroTimeoutPostMessage;
        }(this)),

        // Binary stuff

        // chunks a blob.
        chunk: function(bl) {
            var chunks = [];
            var size = bl.size;
            var start = index = 0;
            var total = Math.ceil(size / util.chunkedMTU);
            while (start < size) {
                var end = Math.min(size, start + util.chunkedMTU);
                var b = bl.slice(start, end);

                var chunk = {
                    __peerData: dataCount,
                    n: index,
                    data: b,
                    total: total
                };

                chunks.push(chunk);

                start = end;
                index += 1;
            }
            dataCount += 1;
            return chunks;
        },

        randomToken: function () {
            return Math.random().toString(36).substr(2);
        },

        isSecure: function() {
            return location.protocol === 'https:';
        }
    };

    exports.util = util;
    /**
     * A peer who can initiate connections with other peers.
     */
    function Peer(id, options) {
        if (!(this instanceof Peer)) return new Peer(id, options);
        EventEmitter.call(this);

        // Deal with overloading
        if (id && id.constructor == Object) {
            options = id;
            id = undefined;
        } else if (id) {
            // Ensure id is a string
            id = id.toString();
        }
        //

        // Configurize options
        options = util.extend({
            debug: 0, // 1: Errors, 2: Warnings, 3: All logs
            host: util.CLOUD_HOST,
            port: util.CLOUD_PORT,
            key: 'peerjs',
            path: '/',
            config: util.defaultConfig
        }, options);
        this.options = options;
        // Detect relative URL host.
        if (options.host === '/') {
            options.host = window.location.hostname;
        }
        // Set path correctly.
        if (options.path[0] !== '/') {
            options.path = '/' + options.path;
        }
        if (options.path[options.path.length - 1] !== '/') {
            options.path += '/';
        }

        // Set whether we use SSL to same as current host
        if (options.secure === undefined && options.host !== util.CLOUD_HOST) {
            options.secure = util.isSecure();
        }
        // Set a custom log function if present
        if (options.logFunction) {
            util.setLogFunction(options.logFunction);
        }
        util.setLogLevel(0);
        //

        // Sanity checks
        // Ensure WebRTC supported
        if (!util.supports.audioVideo && !util.supports.data ) {
            this._delayedAbort('browser-incompatible', 'The current browser does not support WebRTC');
            return;
        }
        // Ensure alphanumeric id
        if (!util.validateId(id)) {
            this._delayedAbort('invalid-id', 'ID "' + id + '" is invalid');
            return;
        }
        // Ensure valid key
        if (!util.validateKey(options.key)) {
            this._delayedAbort('invalid-key', 'API KEY "' + options.key + '" is invalid');
            return;
        }
        // Ensure not using unsecure cloud server on SSL page
        if (options.secure && options.host === '0.peerjs.com') {
            this._delayedAbort('ssl-unavailable',
                'The cloud server currently does not support HTTPS. Please run your own PeerServer to use HTTPS.');
            return;
        }
        //

        // States.
        this.destroyed = false; // Connections have been killed
        this.disconnected = false; // Connection to PeerServer killed manually but P2P connections still active
        this.open = false; // Sockets and such are not yet open.
        //

        // References
        this.connections = {}; // DataConnections for this peer.
        this._lostMessages = {}; // src => [list of messages]
        //

        // Initialize the 'socket' (which is actually a mix of XHR streaming and
        // websockets.)
        var self = this;
        this.socket = new Socket(this.options.secure, this.options.host, this.options.port, this.options.path, this.options.key);
        this.socket.on('message', function(data) {
            self._handleMessage(data);
        });
        this.socket.on('error', function(error) {
            self._abort('socket-error', error);
        });
        this.socket.on('close', function() {
            if (!self.disconnected) { // If we haven't explicitly disconnected, emit error.
                self._abort('socket-closed', 'Underlying socket is already closed.');
            }
        });
        //

        // Start the connections
        if (id) {
            this._initialize(id);
        } else {
            this._retrieveId();
        }
        //
    };

    util.inherits(Peer, EventEmitter);

    /** Get a unique ID from the server via XHR. */
    Peer.prototype._retrieveId = function(cb) {
        var self = this;
        var http = new XMLHttpRequest();
        var protocol = this.options.secure ? 'https://' : 'http://';
        var url = protocol + this.options.host + ':' + this.options.port
            + this.options.path + this.options.key + '/id';
        var queryString = '?ts=' + new Date().getTime() + '' + Math.random();
        url += queryString;

        // If there's no ID we need to wait for one before trying to init socket.
        http.open('get', url, true);
        http.onerror = function(e) {
            util.error('Error retrieving ID', e);
            var pathError = '';
            if (self.options.path === '/' && self.options.host !== util.CLOUD_HOST) {
                pathError = ' If you passed in a `path` to your self-hosted PeerServer, '
                    + 'you\'ll also need to pass in that same path when creating a new'
                    + ' Peer.';
            }
            self._abort('server-error', 'Could not get an ID from the server.' + pathError);
        }
        http.onreadystatechange = function() {
            if (http.readyState !== 4) {
                return;
            }
            if (http.status !== 200) {
                http.onerror();
                return;
            }
            self._initialize(http.responseText);
        };
        http.send(null);
    };

    /** Initialize a connection with the server. */
    Peer.prototype._initialize = function(id) {
        var self = this;
        this.id = id;
        this.socket.start(this.id);
    }

    /** Handles messages from the server. */
    Peer.prototype._handleMessage = function(message) {
        var type = message.type;
        var payload = message.payload;
        var peer = message.src;

        switch (type) {
            case 'OPEN': // The connection to the server is open.
                this.emit('open', this.id);
                this.open = true;
                break;
            case 'ERROR': // Server error.
                this._abort('server-error', payload.msg);
                break;
            case 'ID-TAKEN': // The selected ID is taken.
                this._abort('unavailable-id', 'ID `' + this.id + '` is taken');
                break;
            case 'INVALID-KEY': // The given API key cannot be found.
                this._abort('invalid-key', 'API KEY "' + this.options.key + '" is invalid');
                break;

            //
            case 'LEAVE': // Another peer has closed its connection to this peer.
                util.log('Received leave message from', peer);
                this._cleanupPeer(peer);
                break;

            case 'EXPIRE': // The offer sent to a peer has expired without response.
                this.emit('error', new Error('Could not connect to peer ' + peer));
                break;
            case 'OFFER': // we should consider switching this to CALL/CONNECT, but this is the least breaking option.
                var connectionId = payload.connectionId;
                var connection = this.getConnection(peer, connectionId);

                if (connection) {
                    util.warn('Offer received for existing Connection ID:', connectionId);
                    //connection.handleMessage(message);
                } else {
                    // Create a new connection.
                    if (payload.type === 'data') {
                        connection = new DataConnection(peer, this, {
                            connectionId: connectionId,
                            _payload: payload,
                            metadata: payload.metadata,
                            label: payload.label,
                            serialization: payload.serialization,
                            reliable: payload.reliable
                        });
                        this._addConnection(peer, connection);
                        this.emit('connection', connection);
                    } else {
                        util.warn('Received malformed connection type:', payload.type);
                        return;
                    }
                    // Find messages.
                    var messages = this._getMessages(connectionId);
                    for (var i = 0, ii = messages.length; i < ii; i += 1) {
                        connection.handleMessage(messages[i]);
                    }
                }
                break;
            default:
                if (!payload) {
                    util.warn('You received a malformed message from ' + peer + ' of type ' + type);
                    return;
                }

                var id = payload.connectionId;
                var connection = this.getConnection(peer, id);

                if (connection && connection.pc) {
                    // Pass it on.
                    connection.handleMessage(message);
                } else if (id) {
                    // Store for possible later use
                    this._storeMessage(id, message);
                } else {
                    util.warn('You received an unrecognized message:', message);
                }
                break;
        }
    }

    /** Stores messages without a set up connection, to be claimed later. */
    Peer.prototype._storeMessage = function(connectionId, message) {
        if (!this._lostMessages[connectionId]) {
            this._lostMessages[connectionId] = [];
        }
        this._lostMessages[connectionId].push(message);
    }

    /** Retrieve messages from lost message store */
    Peer.prototype._getMessages = function(connectionId) {
        var messages = this._lostMessages[connectionId];
        if (messages) {
            delete this._lostMessages[connectionId];
            return messages;
        } else {
            return [];
        }
    }

    /**
     * Returns a DataConnection to the specified peer. See documentation for a
     * complete list of options.
     */
    Peer.prototype.connect = function(peer, options) {
        if (this.disconnected) {
            util.warn('You cannot connect to a new Peer because you called '
                + '.disconnect() on this Peer and ended your connection with the'
                + ' server. You can create a new Peer to reconnect.');
            this.emit('error', new Error('Cannot connect to new Peer after disconnecting from server.'));
            return;
        }
        var connection = new DataConnection(peer, this, options);
        this._addConnection(peer, connection);
        return connection;
    }

    /** Add a data/media connection to this peer. */
    Peer.prototype._addConnection = function(peer, connection) {
        if (!this.connections[peer]) {
            this.connections[peer] = [];
        }
        this.connections[peer].push(connection);
    }

    /** Retrieve a data/media connection for this peer. */
    Peer.prototype.getConnection = function(peer, id) {
        var connections = this.connections[peer];
        if (!connections) {
            return null;
        }
        for (var i = 0, ii = connections.length; i < ii; i++) {
            if (connections[i].id === id) {
                return connections[i];
            }
        }
        return null;
    }

    Peer.prototype._delayedAbort = function(type, message) {
        var self = this;
        util.setZeroTimeout(function(){
            self._abort(type, message);
        });
    }

    /** Destroys the Peer and emits an error message. */
    Peer.prototype._abort = function(type, message) {
        util.error('Aborting. Error:', message);
        var err = new Error(message);
        err.type = type;
        this.destroy();
        this.emit('error', err);
    };

    /**
     * Destroys the Peer: closes all active connections as well as the connection
     *  to the server.
     * Warning: The peer can no longer create or accept connections after being
     *  destroyed.
     */
    Peer.prototype.destroy = function() {
        if (!this.destroyed) {
            this._cleanup();
            this.disconnect();
            this.destroyed = true;
        }
    }


    /** Disconnects every connection on this peer. */
    Peer.prototype._cleanup = function() {
        if (this.connections) {
            var peers = Object.keys(this.connections);
            for (var i = 0, ii = peers.length; i < ii; i++) {
                this._cleanupPeer(peers[i]);
            }
        }
        this.emit('close');
    }

    /** Closes all connections to this peer. */
    Peer.prototype._cleanupPeer = function(peer) {
        var connections = this.connections[peer];
        for (var j = 0, jj = connections.length; j < jj; j += 1) {
            connections[j].close();
        }
    }

    /**
     * Disconnects the Peer's connection to the PeerServer. Does not close any
     *  active connections.
     * Warning: The peer can no longer create or accept connections after being
     *  disconnected. It also cannot reconnect to the server.
     */
    Peer.prototype.disconnect = function() {
        var self = this;
        util.setZeroTimeout(function(){
            if (!self.disconnected) {
                self.disconnected = true;
                self.open = false;
                if (self.socket) {
                    self.socket.close();
                }
                self.id = null;
            }
        });
    }

    /**
     * Get a list of available peer IDs. If you're running your own server, you'll
     * want to set allow_discovery: true in the PeerServer options. If you're using
     * the cloud server, email team@peerjs.com to get the functionality enabled for
     * your key.
     */
    Peer.prototype.listAllPeers = function(cb) {
        cb = cb || function() {};
        var self = this;
        var http = new XMLHttpRequest();
        var protocol = this.options.secure ? 'https://' : 'http://';
        var url = protocol + this.options.host + ':' + this.options.port
            + this.options.path + this.options.key + '/peers';
        var queryString = '?ts=' + new Date().getTime() + '' + Math.random();
        url += queryString;

        // If there's no ID we need to wait for one before trying to init socket.
        http.open('get', url, true);
        http.onerror = function(e) {
            self._abort('server-error', 'Could not get peers from the server.');
            cb([]);
        }
        http.onreadystatechange = function() {
            if (http.readyState !== 4) {
                return;
            }
            if (http.status === 401) {
                var helpfulError = '';
                if (self.options.host !== util.CLOUD_HOST) {
                    helpfulError = 'It looks like you\'re using the cloud server. You can email '
                        + 'team@peerjs.com to enable peer listing for your API key.';
                } else {
                    helpfulError = 'You need to enable `allow_discovery` on your self-hosted'
                        + ' PeerServer to use this feature.';
                }
                throw new Error('It doesn\'t look like you have permission to list peers IDs. ' + helpfulError);
                cb([]);
            } else if (http.status !== 200) {
                cb([]);
            } else {
                cb(JSON.parse(http.responseText));
            }
        };
        http.send(null);
    }

    exports.Peer = Peer;
    /**
     * Wraps a DataChannel between two Peers.
     */
    function DataConnection(peer, provider, options) {
        if (!(this instanceof DataConnection)) return new DataConnection(peer, provider, options);
        EventEmitter.call(this);

        this.options = util.extend({
            serialization: 'binary',
            reliable: false
        }, options);

        // Connection is not open yet.
        this.open = false;
        this.type = 'data';
        this.peer = peer;
        this.provider = provider;

        this.id = this.options.connectionId || DataConnection._idPrefix + util.randomToken();

        this.label = this.options.label || this.id;
        this.metadata = this.options.metadata;
        this.serialization = this.options.serialization;
        this.reliable = this.options.reliable;

        // Data channel buffering.
        this._buffer = [];
        this._buffering = false;
        this.bufferSize = 0;

        // For storing large data.
        this._chunkedData = {};

        if (this.options._payload) {
            this._peerBrowser = this.options._payload.browser;
        }

        Negotiator.startConnection(
            this,
            this.options._payload || {
                originator: true
            }
        );
    }

    util.inherits(DataConnection, EventEmitter);

    DataConnection._idPrefix = 'dc_';

    /** Called by the Negotiator when the DataChannel is ready. */
    DataConnection.prototype.initialize = function(dc) {
        this._dc = this.dataChannel = dc;
        this._configureDataChannel();
    }

    DataConnection.prototype._configureDataChannel = function() {
        var self = this;
        if (util.supports.sctp) {
            this._dc.binaryType = 'arraybuffer';
        }
        this._dc.onopen = function() {
            util.log('Data channel connection success');
            self.open = true;
            self.emit('open');
        }

        this._dc.onmessage = function(e) {
            self._handleDataMessage(e);
        };

        this._dc.onclose = function(e) {
            util.log('DataChannel closed for:', self.peer);
            self.close();
        };
    }

// Handles a DataChannel message.
    DataConnection.prototype._handleDataMessage = function(e) {
        var data = e.data;

        if (data.byteLength !== undefined) {
            // ArrayBuffer
        } else {
            // String (JSON)
            data = JSON.parse(data);
        }

        this.emit('data', data);
    }

    /**
     * Exposed functionality for users.
     */

    /** Allows user to close connection. */
    DataConnection.prototype.close = function() {
        if (!this.open) {
            return;
        }
        this.open = false;
        Negotiator.cleanup(this);
        this.emit('close');
    }

    /** Allows user to send data. */
    DataConnection.prototype.send = function(data, chunked) {
        if (!this.open) {
            this.emit('error', new Error('Connection is not open. You should listen for the `open` event before sending messages.'));
            return;
        }

        if (data.byteLength === undefined) {
            data = JSON.stringify(data);
        }

        this._bufferedSend(data);
    }

    DataConnection.prototype._bufferedSend = function(msg) {
        if (this._buffering || !this._trySend(msg)) {
            this._buffer.push(msg);
            this.bufferSize = this._buffer.length;
        }
    }

// Returns true if the send succeeds.
    DataConnection.prototype._trySend = function(msg) {
        try {
            this._dc.send(msg);
        } catch (e) {
            this._buffering = true;

            var self = this;
            setTimeout(function() {
                // Try again.
                self._buffering = false;
                self._tryBuffer();
            }, 100);
            return false;
        }
        return true;
    }

// Try to send the first message in the buffer.
    DataConnection.prototype._tryBuffer = function() {
        if (this._buffer.length === 0) {
            return;
        }

        var msg = this._buffer[0];

        if (this._trySend(msg)) {
            this._buffer.shift();
            this.bufferSize = this._buffer.length;
            this._tryBuffer();
        }
    }

    DataConnection.prototype.handleMessage = function(message) {
        var payload = message.payload;

        switch (message.type) {
            case 'ANSWER':
                this._peerBrowser = payload.browser;

                // Forward to negotiator
                Negotiator.handleSDP(message.type, this, payload.sdp);
                break;
            case 'CANDIDATE':
                Negotiator.handleCandidate(this, payload.candidate);
                break;
            default:
                util.warn('Unrecognized message type:', message.type, 'from peer:', this.peer);
                break;
        }
    }

    /**
     * Manages all negotiations between Peers.
     */
    var Negotiator = {
        pcs: {
            data: {},
            media: {}
        }, // type => {peerId: {pc_id: pc}}.
        //providers: {}, // provider's id => providers (there may be multiple providers/client.
        queue: [] // connections that are delayed due to a PC being in use.
    }

    Negotiator._idPrefix = 'pc_';

    /** Returns a PeerConnection object set up correctly (for data, media). */
    Negotiator.startConnection = function(connection, options) {
        var pc = Negotiator._getPeerConnection(connection, options);

        if (connection.type === 'media' && options._stream) {
            // Add the stream.
            pc.addStream(options._stream);
        }

        // Set the connection's PC.
        connection.pc = connection.peerConnection = pc;
        // What do we need to do now?
        if (options.originator) {
            if (connection.type === 'data') {
                // Create the datachannel.
                var config = {};
                // Dropping reliable:false support, since it seems to be crashing
                // Chrome.
                /*if (util.supports.sctp && !options.reliable) {
                 // If we have canonical reliable support...
                 config = {maxRetransmits: 0};
                 }*/
                // Fallback to ensure older browsers don't crash.
                if (!util.supports.sctp) {
                    config = {reliable: options.reliable};
                }
                var dc = pc.createDataChannel(connection.label, config);
                connection.initialize(dc);
            }

            if (!util.supports.onnegotiationneeded) {
                Negotiator._makeOffer(connection);
            }
        } else {
            Negotiator.handleSDP('OFFER', connection, options.sdp);
        }
    }

    Negotiator._getPeerConnection = function(connection, options) {
        if (!Negotiator.pcs[connection.type]) {
            util.error(connection.type + ' is not a valid connection type. Maybe you overrode the `type` property somewhere.');
        }

        if (!Negotiator.pcs[connection.type][connection.peer]) {
            Negotiator.pcs[connection.type][connection.peer] = {};
        }
        var peerConnections = Negotiator.pcs[connection.type][connection.peer];

        var pc;
        // Not multiplexing while FF and Chrome have not-great support for it.
        /*if (options.multiplex) {
         ids = Object.keys(peerConnections);
         for (var i = 0, ii = ids.length; i < ii; i += 1) {
         pc = peerConnections[ids[i]];
         if (pc.signalingState === 'stable') {
         break; // We can go ahead and use this PC.
         }
         }
         } else */
        if (options.pc) { // Simplest case: PC id already provided for us.
            pc = Negotiator.pcs[connection.type][connection.peer][options.pc];
        }

        if (!pc || pc.signalingState !== 'stable') {
            pc = Negotiator._startPeerConnection(connection);
        }
        return pc;
    }

    /*
     Negotiator._addProvider = function(provider) {
     if ((!provider.id && !provider.disconnected) || !provider.socket.open) {
     // Wait for provider to obtain an ID.
     provider.on('open', function(id) {
     Negotiator._addProvider(provider);
     });
     } else {
     Negotiator.providers[provider.id] = provider;
     }
     }*/


    /** Start a PC. */
    Negotiator._startPeerConnection = function(connection) {
        util.log('Creating RTCPeerConnection.');

        var id = Negotiator._idPrefix + util.randomToken();
        var optional = {};

        if (connection.type === 'data' && !util.supports.sctp) {
            optional = {optional: [{RtpDataChannels: true}]};
        } else if (connection.type === 'media') {
            // Interop req for chrome.
            optional = {optional: [{DtlsSrtpKeyAgreement: true}]};
        }

        var pc = new RTCPeerConnection(connection.provider.options.config, optional);
        Negotiator.pcs[connection.type][connection.peer][id] = pc;

        Negotiator._setupListeners(connection, pc, id);

        return pc;
    }

    /** Set up various WebRTC listeners. */
    Negotiator._setupListeners = function(connection, pc, pc_id) {
        var peerId = connection.peer;
        var connectionId = connection.id;
        var provider = connection.provider;

        // ICE CANDIDATES.
        util.log('Listening for ICE candidates.');
        pc.onicecandidate = function(evt) {
            if (evt.candidate) {
                util.log('Received ICE candidates for:', connection.peer);
                provider.socket.send({
                    type: 'CANDIDATE',
                    payload: {
                        candidate: evt.candidate,
                        type: connection.type,
                        connectionId: connection.id
                    },
                    dst: peerId
                });
            }
        };

        pc.oniceconnectionstatechange = function() {
            switch (pc.iceConnectionState) {
                case 'disconnected':
//          console.log(pc.iceConnectionState);
                case 'failed':
                    util.log('iceConnectionState is disconnected, closing connections to ' + peerId);
                    connection.close();
                    break;
                case 'completed':
                    pc.onicecandidate = util.noop;
                    break;
            }
        };

        // Fallback for older Chrome impls.
        pc.onicechange = pc.oniceconnectionstatechange;

        // ONNEGOTIATIONNEEDED (Chrome)
        util.log('Listening for `negotiationneeded`');
        pc.onnegotiationneeded = function() {
            util.log('`negotiationneeded` triggered');
            if (pc.signalingState == 'stable') {
                Negotiator._makeOffer(connection);
            } else {
                util.log('onnegotiationneeded triggered when not stable. Is another connection being established?');
            }
        };

        // DATACONNECTION.
        util.log('Listening for data channel');
        // Fired between offer and answer, so options should already be saved
        // in the options hash.
        pc.ondatachannel = function(evt) {
            util.log('Received data channel');
            var dc = evt.channel;
            var connection = provider.getConnection(peerId, connectionId);
            connection.initialize(dc);
        };
    }

    Negotiator.cleanup = function(connection) {
        util.log('Cleaning up PeerConnection to ' + connection.peer);

        var pc = connection.pc;

        if (!!pc && (pc.readyState !== 'closed' || pc.signalingState !== 'closed')) {
            pc.close();
            connection.pc = null;
        }
    }

    Negotiator._makeOffer = function(connection) {
        var pc = connection.pc;
        pc.createOffer(function(offer) {
            util.log('Created offer.');

            if (!util.supports.sctp && connection.type === 'data' && connection.reliable) {
                offer.sdp = Reliable.higherBandwidthSDP(offer.sdp);
            }

            pc.setLocalDescription(offer, function() {
                util.log('Set localDescription: offer', 'for:', connection.peer);
                connection.provider.socket.send({
                    type: 'OFFER',
                    payload: {
                        sdp: offer,
                        type: connection.type,
                        label: connection.label,
                        connectionId: connection.id,
                        reliable: connection.reliable,
                        serialization: connection.serialization,
                        metadata: connection.metadata,
                        browser: util.browser
                    },
                    dst: connection.peer
                });
            }, function(err) {
                connection.provider.emit('error', err);
                util.log('Failed to setLocalDescription, ', err);
            });
        }, function(err) {
            connection.provider.emit('error', err);
            util.log('Failed to createOffer, ', err);
        }, connection.options.constraints);
    }

    Negotiator._makeAnswer = function(connection) {
        var pc = connection.pc;

        pc.createAnswer(function(answer) {
            util.log('Created answer.');

            if (!util.supports.sctp && connection.type === 'data' && connection.reliable) {
                answer.sdp = Reliable.higherBandwidthSDP(answer.sdp);
            }

            pc.setLocalDescription(answer, function() {
                util.log('Set localDescription: answer', 'for:', connection.peer);
                connection.provider.socket.send({
                    type: 'ANSWER',
                    payload: {
                        sdp: answer,
                        type: connection.type,
                        connectionId: connection.id,
                        browser: util.browser
                    },
                    dst: connection.peer
                });
            }, function(err) {
                connection.provider.emit('error', err);
                util.log('Failed to setLocalDescription, ', err);
            });
        }, function(err) {
            connection.provider.emit('error', err);
            util.log('Failed to create answer, ', err);
        });
    }

    /** Handle an SDP. */
    Negotiator.handleSDP = function(type, connection, sdp) {
        sdp = new RTCSessionDescription(sdp);
        var pc = connection.pc;

        util.log('Setting remote description', sdp);
        pc.setRemoteDescription(sdp, function() {
            util.log('Set remoteDescription:', type, 'for:', connection.peer);

            if (type === 'OFFER') {
                Negotiator._makeAnswer(connection);
            }
        }, function(err) {
            connection.provider.emit('error', err);
            util.log('Failed to setRemoteDescription, ', err);
        });
    }

    /** Handle a candidate. */
    Negotiator.handleCandidate = function(connection, ice) {
        var candidate = ice.candidate;
        var sdpMLineIndex = ice.sdpMLineIndex;
        connection.pc.addIceCandidate(new RTCIceCandidate({
            sdpMLineIndex: sdpMLineIndex,
            candidate: candidate
        }));
        util.log('Added ICE candidate for:', connection.peer);
    }
    /**
     * An abstraction on top of WebSockets and XHR streaming to provide fastest
     * possible connection for peers.
     */
    function Socket(secure, host, port, path, key) {
        if (!(this instanceof Socket)) return new Socket(secure, host, port, path, key);

        EventEmitter.call(this);

        // Disconnected manually.
        this.disconnected = false;
        this._queue = [];

        var httpProtocol = secure ? 'https://' : 'http://';
        var wsProtocol = secure ? 'wss://' : 'ws://';
        this._httpUrl = httpProtocol + host + ':' + port + path + key;
        this._wsUrl = wsProtocol + host + ':' + port + path + 'peerjs?key=' + key;
    }

    util.inherits(Socket, EventEmitter);


    /** Check in with ID or get one from server. */
    Socket.prototype.start = function(id) {
        this.id = id;

        var token = util.randomToken();
        this._httpUrl += '/' + id + '/' + token;
        this._wsUrl += '&id='+id+'&token='+token;

        this._startXhrStream();
        this._startWebSocket();
    }


    /** Start up websocket communications. */
    Socket.prototype._startWebSocket = function(id) {
        var self = this;

        if (this._socket) {
            return;
        }

        this._socket = new WebSocket(this._wsUrl);

        this._socket.onmessage = function(event) {
            var data;
            try {
                data = JSON.parse(event.data);
            } catch(e) {
                util.log('Invalid server message', event.data);
                return;
            }
            self.emit('message', data);
        };

        // Take care of the queue of connections if necessary and make sure Peer knows
        // socket is open.
        this._socket.onopen = function() {
            if (self._timeout) {
                clearTimeout(self._timeout);
                setTimeout(function(){
                    self._http.abort();
                    self._http = null;
                }, 5000);
            }
            self._sendQueuedMessages();
            util.log('Socket open');
        };
    }

    /** Start XHR streaming. */
    Socket.prototype._startXhrStream = function(n) {
        try {
            var self = this;
            this._http = new XMLHttpRequest();
            this._http._index = 1;
            this._http._streamIndex = n || 0;
            this._http.open('post', this._httpUrl + '/id?i=' + this._http._streamIndex, true);
            this._http.onreadystatechange = function() {
                if (this.readyState == 2 && this.old) {
                    this.old.abort();
                    delete this.old;
                }
                if (this.readyState > 2 && this.status == 200 && this.responseText) {
                    self._handleStream(this);
                }
            };
            this._http.send(null);
            this._setHTTPTimeout();
        } catch(e) {
            util.log('XMLHttpRequest not available; defaulting to WebSockets');
        }
    }


    /** Handles onreadystatechange response as a stream. */
    Socket.prototype._handleStream = function(http) {
        // 3 and 4 are loading/done state. All others are not relevant.
        var messages = http.responseText.split('\n');

        // Check to see if anything needs to be processed on buffer.
        if (http._buffer) {
            while (http._buffer.length > 0) {
                var index = http._buffer.shift();
                var bufferedMessage = messages[index];
                try {
                    bufferedMessage = JSON.parse(bufferedMessage);
                } catch(e) {
                    http._buffer.shift(index);
                    break;
                }
                this.emit('message', bufferedMessage);
            }
        }

        var message = messages[http._index];
        if (message) {
            http._index += 1;
            // Buffering--this message is incomplete and we'll get to it next time.
            // This checks if the httpResponse ended in a `\n`, in which case the last
            // element of messages should be the empty string.
            if (http._index === messages.length) {
                if (!http._buffer) {
                    http._buffer = [];
                }
                http._buffer.push(http._index - 1);
            } else {
                try {
                    message = JSON.parse(message);
                } catch(e) {
                    util.log('Invalid server message', message);
                    return;
                }
                this.emit('message', message);
            }
        }
    }

    Socket.prototype._setHTTPTimeout = function() {
        var self = this;
        this._timeout = setTimeout(function() {
            var old = self._http;
            if (!self._wsOpen()) {
                self._startXhrStream(old._streamIndex + 1);
                self._http.old = old;
            } else {
                old.abort();
            }
        }, 25000);
    }

    /** Is the websocket currently open? */
    Socket.prototype._wsOpen = function() {
        return this._socket && this._socket.readyState == 1;
    }

    /** Send queued messages. */
    Socket.prototype._sendQueuedMessages = function() {
        for (var i = 0, ii = this._queue.length; i < ii; i += 1) {
            this.send(this._queue[i]);
        }
    }

    /** Exposed send for DC & Peer. */
    Socket.prototype.send = function(data) {
        if (this.disconnected) {
            return;
        }

        // If we didn't get an ID yet, we can't yet send anything so we should queue
        // up these messages.
        if (!this.id) {
            this._queue.push(data);
            return;
        }

        if (!data.type) {
            this.emit('error', 'Invalid message');
            return;
        }

        var message = JSON.stringify(data);
        if (this._wsOpen()) {
            this._socket.send(message);
        } else {
            var http = new XMLHttpRequest();
            var url = this._httpUrl + '/' + data.type.toLowerCase();
            http.open('post', url, true);
            http.setRequestHeader('Content-Type', 'application/json');
            http.send(message);
        }
    }

    Socket.prototype.close = function() {
        if (!this.disconnected && this._wsOpen()) {
            this._socket.close();
            this.disconnected = true;
        }
    }

})(this);

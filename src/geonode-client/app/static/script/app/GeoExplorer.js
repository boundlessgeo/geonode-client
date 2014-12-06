/**
 * Copyright (c) 2009 The Open Planning Project
 */

// http://www.sencha.com/forum/showthread.php?141254-Ext.Slider-not-working-properly-in-IE9
// TODO re-evaluate once we move to Ext 4
Ext.override(Ext.dd.DragTracker, {
    onMouseMove: function (e, target) {
        if (this.active && Ext.isIE && !Ext.isIE9 && !e.browserEvent.button) {
            e.preventDefault();
            this.onMouseUp(e);
            return;
        }
        e.preventDefault();
        var xy = e.getXY(), s = this.startXY;
        this.lastXY = xy;
        if (!this.active) {
            if (Math.abs(s[0] - xy[0]) > this.tolerance || Math.abs(s[1] - xy[1]) > this.tolerance) {
                this.triggerStart(e);
            } else {
                return;
            }
        }
        this.fireEvent('mousemove', this, e);
        this.onDrag(e);
        this.fireEvent('drag', this, e);
    }
});

/**
 * Constructor: GeoExplorer
 * Create a new GeoExplorer application.
 *
 * Parameters:
 * config - {Object} Optional application configuration properties.
 *
 * Valid config properties:
 * map - {Object} Map configuration object.
 * ows - {String} OWS URL
 *
 * Valid map config properties:
 * layers - {Array} A list of layer configuration objects.
 * center - {Array} A two item array with center coordinates.
 * zoom - {Number} An initial zoom level.
 *
 * Valid layer config properties:
 * name - {String} Required WMS layer name.
 * title - {String} Optional title to display for layer.
 */
var GeoExplorer = Ext.extend(gxp.Viewer, {
    
    /**
     * api: config[localGeoServerBaseUrl]
     * ``String`` url of the local GeoServer instance
     */
    localGeoServerBaseUrl: "",

    /**
     * api: config[useMapOverlay]
     * ``Boolean`` Should we add a scale overlay to the map? Set to false
     * to not add a scale overlay.
     */
    useMapOverlay: null,

    /**
     * private: property[toggleGroup]
     * ``String``
     */
    toggleGroup: "map",
    
    /**
     * private: property[mapPanel]
     * the :class:`GeoExt.MapPanel` instance for the main viewport
     */
    mapPanel: null,

    /**
     * Property: toolbar
     * {Ext.Toolbar} the toolbar for the main viewport
     */
    toolbar: null,

    /**
     * Property: capGrid
     * {<Ext.Window>} A window which includes a CapabilitiesGrid panel.
     */
    capGrid: null,
    
    /**
     * Property: modified
     * ``Number``
     */
    modified: 0,

    /**
     * Property: popupCache
     * {Object} An object containing references to visible popups so that 
     *     we can insert responses from multiple requests.
     */
    popupCache: null,
    
    /** private: property[urlPortRegEx]
     *  ``RegExp``
     */
    urlPortRegEx: /^(http[s]?:\/\/[^:]*)(:80|:443)?\//,
    
    //public variables for string literals needed for localization
    backgroundContainerText: "UT:Background",
    connErrorTitleText: "UT:Connection Error",
    connErrorText: "UT:The server returned an error",
    connErrorDetailsText: "UT:Details...",
    heightLabel: 'UT: Height',
    largeSizeLabel: 'UT:Large',
    layerContainerText: "UT:Map Layers",
    layerSelectionLabel: "UT:View available data from:",
    layersContainerText: "UT:Data",
    layersPanelText: "UT:Layers",
    legendPanelText: "UT:Legend",
    mapSizeLabel: 'UT: Map Size', 
    metadataFormCancelText : "UT:Cancel",
    metadataFormSaveAsCopyText : "UT:Save as Copy",
    metadataFormSaveText : "UT:Save",
    metaDataHeader: 'UT:About this Map',
    metaDataMapAbstract: 'UT:Abstract',
    metaDataMapTitle: 'UT:Title',
    miniSizeLabel: 'UT: Mini',
    premiumSizeLabel: 'UT: Premium',
    propertiesText: "UT:Properties",
    publishActionText: 'UT:Publish Map',
    saveFailMessage: "UT: Sorry, your map could not be saved.",
    saveFailTitle: "UT: Error While Saving",
    saveMapText: "UT: Save Map",
    saveMapAsText: "UT: Save Map As",
    saveNotAuthorizedMessage: "UT: You Must be logged in to save this map.",
    smallSizeLabel: 'UT: Small',
    sourceLoadFailureMessage: 'UT: Error contacting server.\n Please check the url and try again.',
    unknownMapMessage: 'UT: The map that you are trying to load does not exist.  Creating a new map instead.',
    unknownMapTitle: 'UT: Unknown Map',
    widthLabel: 'UT: Width',
    zoomSelectorText: 'UT:Zoom level',
    zoomSliderTipText: "UT: Zoom Level",
    zoomToLayerExtentText: "UT:Zoom to Layer Extent",

    constructor: function(config) {
        config = config || {};
        this.popupCache = {};
        // add any custom application events
        this.addEvents(
            /**
             * api: event[saved]
             * Fires when the map has been saved.
             *  Listener arguments:
             *  * ``String`` the map id
             */
            "saved",
            /**
             * api: event[beforeunload]
             * Fires before the page unloads. Return false to stop the page
             * from unloading.
             */
            "beforeunload"
        );
        
        // Common tools for viewer and composer go here. Note that this
        // modifies the viewer's initialConfig.
        if (config.useToolbar !== false) {
            config.tools = (config.tools || []).concat({
                ptype: "gxp_wmsgetfeatureinfo",
                // uncomment the line below if you want feature info in a grid
                //format: "grid",
                actionTarget: "main.tbar",
                toggleGroup: this.toggleGroup,
                layerParams: ['TIME'],
                outputConfig: {width: 400, height: 300}
            }, {
                ptype: "gxp_playback",
                id: "playback-tool",
                outputTarget: "map-bbar"
            });
        }

        // add old ptypes
        Ext.preg("gx_wmssource", gxp.plugins.WMSSource);
        Ext.preg("gx_olsource", gxp.plugins.OLSource);
        Ext.preg("gx_googlesource", gxp.plugins.GoogleSource);
        
        // global request proxy and error handling
        Ext.util.Observable.observeClass(Ext.data.Connection);
        Ext.data.Connection.on({
            "beforerequest": function(conn, options) {
                // use django's /geoserver endpoint when talking to the local
                // GeoServer's RESTconfig API
                var url = options.url.replace(this.urlPortRegEx, "$1/");
                if (this.localGeoServerBaseUrl) {
                    if (url.indexOf(this.localGeoServerBaseUrl) == 0) {
                        // replace local GeoServer url with /geoserver/
                        options.url = url.replace(
                            new RegExp("^" + this.localGeoServerBaseUrl),
                            "/geoserver/"
                        );
                        return;
                    }
                    var localUrl = this.localGeoServerBaseUrl.replace(
                        this.urlPortRegEx, "$1/");
                    if(url.indexOf(localUrl + "rest/") === 0) {
                        options.url = url.replace(new RegExp("^" +
                            localUrl), "/geoserver/");
                        return;
                    }
                }
                // use the proxy for all non-local requests
                if(this.proxy && options.url.indexOf(this.proxy) !== 0 &&
                        options.url.indexOf(window.location.protocol) === 0) {
                    var parts = options.url.replace(/&$/, "").split("?");
                    var params = Ext.apply(parts[1] && Ext.urlDecode(
                        parts[1]) || {}, options.params);
                    url = Ext.urlAppend(parts[0], Ext.urlEncode(params));
                    delete options.params;
                    options.url = this.proxy + encodeURIComponent(url);
                }
            },
            "requestexception": function(conn, response, options) {
                if(options.failure) {
                    // exceptions are handled elsewhere
                } else {
                    this.mapPlugins[0].busyMask && this.mapPlugins[0].busyMask.hide();
                    var url = options.url;
                    if (response.status == 401 && url.indexOf("http" != 0) &&
                                            url.indexOf(this.proxy) === -1) {
                        var submit = function() {
                            form.getForm().submit({
                                waitMsg: "Logging in...",
                                success: function(form, action) {
                                    win.close();
                                    document.cookie = action.response.getResponseHeader("Set-Cookie");
                                    // resend the original request
                                    Ext.Ajax.request(options);
                                },
                                failure: function(form, action) {
                                    var username = form.items.get(0);
                                    var password = form.items.get(1);
                                    username.markInvalid();
                                    password.markInvalid();
                                    username.focus(true);
                                },
                                scope: this
                            });
                        }.createDelegate(this);
                        var csrfToken, csrfMatch = document.cookie.match(/csrftoken=(\w+);/);
                        if (csrfMatch && csrfMatch.length > 0) {
                            csrfToken = csrfMatch[1];
                        }
                        var win = new Ext.Window({
                            title: "GeoNode Login",
                            modal: true,
                            width: 230,
                            autoHeight: true,
                            layout: "fit",
                            items: [{
                                xtype: "form",
                                autoHeight: true,
                                labelWidth: 55,
                                border: false,
                                bodyStyle: "padding: 10px;",
                                url: "/accounts/ajax_login",
                                waitMsgTarget: true,
                                errorReader: {
                                    // teach ExtJS a bit of RESTfulness
                                    read: function(response) {
                                        return {
                                            success: response.status == 200,
                                            records: []
                                        };
                                    }
                                },
                                defaults: {
                                    anchor: "100%"
                                },
                                items: [{
                                    xtype: "textfield",
                                    name: "username",
                                    fieldLabel: "Username"
                                }, {
                                    xtype: "textfield",
                                    name: "password",
                                    fieldLabel: "Password",
                                    inputType: "password"
                                }, {
                                    xtype: "hidden",
                                    name: "csrfmiddlewaretoken",
                                    value: csrfToken
                                }, {
                                    xtype: "button",
                                    text: "Login",
                                    inputType: "submit",
                                    handler: submit
                                }]
                            }],
                            keys: {
                                "key": Ext.EventObject.ENTER,
                                "fn": submit
                            }
                        });
                        win.show();
                        var form = win.items.get(0);
                        form.items.get(0).focus(false, 100);
                    } else if (response.status != 405 && url != "/geoserver/rest/styles") {
                        // 405 from /rest/styles is ok because we use it to
                        // test whether we're authenticated or not
                        this.displayXHRTrouble(response);
                    }
                }
            },
            scope: this
        });
        
        // register the color manager with every color field, for Styler
        Ext.util.Observable.observeClass(gxp.form.ColorField);
        gxp.form.ColorField.on({
            render: function(field) {
                var manager = new Styler.ColorManager();
                manager.register(field);
            }
        });

        // global beforeunload handler
        window.onbeforeunload = (function() {
            if (this.fireEvent("beforeunload") === false) {
                return "If you leave this page, unsaved changes will be lost.";
            }
        }).createDelegate(this);
        
        // limit combo boxes to the window they belong to - fixes issues with
        // list shadow covering list items
        Ext.form.ComboBox.prototype.getListParent = function() {
            return this.el.up(".x-window") || document.body;
        };
        
        // don't draw window shadows - allows us to use autoHeight: true
        // without using syncShadow on the window
        Ext.Window.prototype.shadow = false;
        
        GeoExplorer.superclass.constructor.apply(this, [config]);
    },
    
    displayXHRTrouble: function(response) {
        response.status && Ext.Msg.show({
            title: this.connErrorTitleText,
            msg: this.connErrorText +
                ": " + response.status + " " + response.statusText,
            icon: Ext.MessageBox.ERROR,
            buttons: {ok: this.connErrorDetailsText, cancel: true},
            fn: function(result) {
                if(result == "ok") {
                    var details = new Ext.Window({
                        title: response.status + " " + response.statusText,
                        width: 400,
                        height: 300,
                        items: {
                            xtype: "container",
                            cls: "error-details",
                            html: response.responseText
                        },
                        autoScroll: true,
                        buttons: [{
                            text: "OK",
                            handler: function() { details.close(); }
                        }]
                    });
                    details.show();
                }
            }
        });
    },
    
    loadConfig: function(config, callback) {
        config = Ext.apply(config || {}, {
            proxy: "/proxy/?url=",
            rest: "/maps/"
        });
        function createToolCfg(config, toggleGroup) {
            return (config.tools || []).concat({
                ptype: "gxp_mapproperties",
                actionTarget: {target: "paneltbar", index: 0}
            }, {
                ptype: "gxp_zoom",
                actionTarget: {target: "paneltbar", index: 4}
            }, {
                ptype: "gxp_navigationhistory",
                actionTarget: {target: "paneltbar", index: 6}
            }, {
                ptype: "gxp_zoomtoextent",
                actionTarget: {target: "paneltbar", index: 8}
            }, {
                ptype: "gxp_layertree",
                outputConfig: {id: "treecontent"},
                outputTarget: "layertree"
            }, {
                ptype: "gxp_zoomtolayerextent",
                actionTarget: "treecontent.contextMenu"
            }, {
                ptype: "gxp_addlayers",
                actionTarget: "treetbar",
                createExpander: function() {
                    return new GeoExplorer.CapabilitiesRowExpander({
                        ows: config.localGeoServerBaseUrl + "ows"
                    });
                }
            }, {
                ptype: "gxp_removelayer",
                actionTarget: ["treetbar", "treecontent.contextMenu"]
            }, {
                ptype: "app_layerproperties",
                layerPanelConfig: {
                    "gxp_wmslayerpanel": {rasterStyling: true}
                },
                actionTarget: ["treetbar", "treecontent.contextMenu"]
            }, {
                ptype: "gxp_styler",
                rasterStyling: true,
                actionTarget: ["treetbar", "treecontent.contextMenu"]
            }, {
                ptype: "gxp_legend",
                outputTarget: 'legend',
                outputConfig: {
                    autoScroll: true,
                    title: null
                }
            }, {
                ptype: "gxp_print",
                includeLegend: true,
                printCapabilities: window.printCapabilities,
                actionTarget: {target: "paneltbar", index: 3}
            }, {
                ptype: "gxp_googleearth",
                actionTarget: {target: "paneltbar", index: 4},
                apiKeys: {
                    "localhost": "ABQIAAAAeDjUod8ItM9dBg5_lz0esxTnme5EwnLVtEDGnh-lFVzRJhbdQhQBX5VH8Rb3adNACjSR5kaCLQuBmw",
                    "localhost:8080": "ABQIAAAAeDjUod8ItM9dBg5_lz0esxTnme5EwnLVtEDGnh-lFVzRJhbdQhQBX5VH8Rb3adNACjSR5kaCLQuBmw",
                    "localhost:8000": "ABQIAAAAeDjUod8ItM9dBg5_lz0esxTnme5EwnLVtEDGnh-lFVzRJhbdQhQBX5VH8Rb3adNACjSR5kaCLQuBmw",
                    "example.com": "-your-api-key-here-"
                }
            }, {
                ptype: "gxp_timeline",
                id: "timeline-tool",
                outputTarget: "timeline-container",
                outputConfig: {
                    title: null
                },
                featureEditor: "annotations_editor",
                playbackTool: "playback-tool"
            }, {
                ptype: "gxp_timelinelayers",
                timelineTool: "timeline-tool",
                actionTarget: "timeline-container.tbar"
            }, {
                ptype: "app_notes",
                createLayerUrl: "/data/create_annotations_layer/{mapID}",
                layerNameTpl: "_map_{mapID}_annotations",
                workspacePrefix: "geonode",
                featureEditor: "annotations_editor",
                outputConfig: {
                    id: 'notes_menu'
                },
                actionTarget: {target: "paneltbar", index: 12}
            },{
                ptype: "gxp_featuremanager",
                id: "general_manager",
                paging: false,
                autoSetLayer: true
            }, {
                ptype: "gxp_featureeditor",
                toggleGroup: toggleGroup,
                featureManager: "general_manager",
                autoLoadFeature: true,
                actionTarget: {target: "paneltbar", index: 13}
            }, {
                ptype: "gxp_featuremanager",
                id: "annotations_manager",
                autoLoadFeatures: true,
                autoSetLayer: false,
                paging: false
            }, {
                ptype: "gxp_featureeditor",
                id: "annotations_editor",
                toggleGroup: toggleGroup,
                supportAbstractGeometry: true,
                showSelectedOnly: false,
                supportNoGeometry: true,
                outputConfig: {
                    width: 325,
                    editorPluginConfig: {
                        ptype: "gxp_editorform",
                        bodyStyle: "padding: 5px 5px 0",
                        fieldConfig: {
                            'title': {fieldLabel: "Title", allowBlank: false},
                            'start_time': {xtype: 'gxp_datetimefield', fieldLabel: "Start time", allowBlank: false},
                            'end_time': {xtype: 'gxp_datetimefield', fieldLabel: "End time <span class='optional-form-label'>(optional)</span>"},
                            'in_timeline': {boxLabel: "Include in timeline"},
                            'in_map': {boxLabel: "Include in map"},
                            'appearance': {xtype: "combo", fieldLabel: "Position", emptyText: "Only needed for Events", comboStoreData: [
                                ['tl-tl?', 'Top left'], 
                                ['t-t?', 'Top center'],
                                ['tr-tr?', 'Top right'],
                                ['l-l?', 'Center left'],
                                ['c-c?', 'Center'],
                                ['r-r?', 'Center right'],
                                ['bl-bl?', 'Bottom left'],
                                ['b-b?', 'Bottom center'],
                                ['br-br?', 'Bottom right']
                            ]}
                        }
                    }
                },
                featureManager: "annotations_manager",
                actionTarget: "notes_menu",
                createFeatureActionText: "Add note",
                iconClsAdd: 'gxp-icon-addnote',
                editFeatureActionText: "Edit note"
            },{
                ptype: 'app_scaleoverlay',
                outputTarget:'map-bbar'
            });
	    }
        Ext.Ajax.request({
            url: window.location.href.split("?")[0].replace(/\/view|\/embed|(\/new)|([0-9])$/, "$1$2/data"),
            success: function(response) {
                var loadedConfig = Ext.decode(response.responseText, true);
                Ext.apply(config, loadedConfig);
                if(!loadedConfig.tools){
                    config.tools = createToolCfg(config, this.toggleGroup);
                }
                this.mapID = config.id;
                callback.call(this, config);
            },
            scope: this
        });
    },
    
    initMapPanel: function() {
        this.mapItems = [{
            xtype: "gx_zoomslider",
            vertical: true,
            cls:'gxp-fade-control',
            height: 100,
            plugins: new GeoExt.ZoomSliderTip({
                template: "<div>"+this.zoomSliderTipText+": {zoom}<div>"
            })
        }];
        
        this.mapPlugins = [{
            ptype: "gxp_loadingindicator", 
            onlyShowOnFirstLoad: true
        }];
        
        //ensure map has a bbar with our prefered id
        if (this.initialConfig.map && this.initialConfig.map.bbar) {
            this.initialConfig.map.bbar.id = 'map-bbar';
            this.initialConfig.map.bbar.height = 55;
        }
        else {
            this.initialConfig.map = Ext.applyIf(this.initialConfig.map ||
            {}, {
                bbar: {
                    id: 'map-bbar',
                    height:55,
                    items: []
                }
            });
            
        }
         
        GeoExplorer.superclass.initMapPanel.apply(this, arguments);
    },
    
    /**
     * Method: initPortal
     * Create the various parts that compose the layout.
     */
    initPortal: function() {
        /*this.on("beforeunload", function() {
            if (this.modified) {
                this.showMetadataForm();
                return false;
            }
        }, this);*/

        this.on("ready", function() {
            this.mapPanel.layers.on({
                "update": function() {this.modified |= 1;},
                "add": function() {this.modified |= 1;},
                "remove": function(store, rec) {
                    this.modified |= 1;
                },
                scope: this
            });
        });

       var layersContainer = new Ext.Panel({
            id: "layertree",
            autoScroll: true,
            border: false,
            title: this.layersContainerText,
            tbar: {
                id: 'treetbar'
            }
        });

        var layerTree;
        this.on("ready", function(){
            var startSourceId = null;
            for (var id in this.layerSources) {
                source = this.layerSources[id];
                if (source.store && source instanceof gxp.plugins.WMSSource &&
                                source.url.indexOf("/geoserver/wms" === 0)) {
                    startSourceId = id;
                    source.store.on("load", function() {
                        source.store.filterBy(function(rec) {
                            var name = rec.get('name');
                            return !(new RegExp("geonode:_map_[0-9]+_annotations").test(name) ||
                                new RegExp("geonode:annotations_[0-9]+").test(name));
                        }, this);
                    }, this);
                }
            }
            // find the add layers plugin
            var addLayers = null;
            for (var key in this.tools) {
                var tool = this.tools[key];
                if (tool.ptype === "gxp_addlayers") {
                    addLayers = tool;
                    addLayers.startSourceId = startSourceId;
                }
            }
            var urlParts = window.location.href.split("?"), fromLayer;
            if (urlParts.length > 1) {
                fromLayer = Ext.urlDecode(urlParts[1]).layer;
                if (fromLayer) {
                    this.createLayerRecord({
                        source: startSourceId,
                        name: fromLayer
                    }, function(record) {
                        this.mapPanel.layers.add([record]);
                        this.mapPanel.map.zoomToExtent(record.getLayer().maxExtent);
                    }, this);
                }
            }
            if (!fromLayer && !this.mapID) {
                if (addLayers !== null) {
                    addLayers.showCapabilitiesGrid();
                }
            }

            // add custom tree contextmenu items
            layerTree = Ext.getCmp("treecontent");
        }, this);
        
        //give the native map nav controls a common container
        this.on('ready',function(){
            var ctEl = new Ext.Element(Ext.DomHelper.append(Ext.DomQuery.selectNode('.olMapViewport'),[{tag:'div',id:'FadeControlContainer'}]));
            ctEl.appendChild(Ext.select('.olControlPanPanel, .olControlZoomPanel'));
        },this);

        var layersTabPanel = new Ext.TabPanel({
            border: false,
            deferredRender: false,
            items: [
                layersContainer, {
                xtype: 'panel',
                title: this.legendPanelText,
                layout: 'fit', 
                id: 'legend', 
                split: true
            }],
            activeTab: 0
        });

        //needed for Safari
        var westPanel = new Ext.Panel({
            layout: "fit",
            collapseMode: "mini",
            collapsed:true,
            header: false,
            split: true,
            items: [layersTabPanel],
            region: "west",
            width: 250
        });

        this.toolbar = new Ext.Toolbar({
            disabled: true,
            id: 'paneltbar',
            items: this.createTools()
        });

        this.on("ready", function() {
            // enable only those items that were not specifically disabled
            var disabled = this.toolbar.items.filterBy(function(item) {
                return item.initialConfig && item.initialConfig.disabled;
            });
            this.toolbar.enable();
            disabled.each(function(item) {
                item.disable();
            });
        }, this);
        
        this.mapPanelContainer = new Ext.Panel({
            layout: "card", 
            region: "center",
            defaults: {
                // applied to each contained panel
                border:false
            },
            items: [
                this.mapPanel,
                {
                    xtype: 'gxp_googleearthpanel', 
                    mapPanel: this.mapPanel
                }
            ],
            activeItem: 0
        });

        var header = new Ext.Panel({
            region: "north",
            autoHeight: true,
            contentEl: 'header-wrapper'
        });

        Lang.registerLinks();

        this.portalItems = [
            header, {
                region: "center",
                xtype: "container",
                layout: "fit",
                border: false,
                hideBorders: true,
                items: {
                    layout: "border",
                    deferredRender: false,
                    tbar: this.toolbar,
                    items: [
                        this.mapPanelContainer,
                        westPanel, {
                            region: "south",
                            height: 175,
                            split: true,
                            collapsed: true,
                            collapsible: true,
                            id: "timeline-container",
                            xtype: "panel",
                            tbar: ['->'],
                            layout: "fit",
                            region: "south"
                        }
                    ],
                    ref: "../../main"
                }
            }
        ];
        
        GeoExplorer.superclass.initPortal.apply(this, arguments);
    },
    
    createTools: function() {
        var tools = [
            new Ext.Button({
                tooltip: this.saveMapText,
                handler: this.showMetadataForm,
                scope: this,
                iconCls: "icon-save"
            }),
            new Ext.Action({
                tooltip: this.publishActionText,
                handler: this.makeExportDialog,
                scope: this,
                iconCls: 'icon-export',
                disabled: !this.mapID
            }),
            "-"
        ];
        this.on("saved", function() {
            // enable the "Publish Map" button
            tools[1].enable();
            this.modified ^= this.modified & 1;
        }, this);

        return tools;
    },

    /** private: method[makeExportDialog]
     *
     * Create a dialog providing the HTML snippet to use for embedding the 
     * (persisted) map, etc. 
     */
    makeExportDialog: function() { 
        new Ext.Window({
            title: this.publishActionText,
            layout: "fit",
            width: 380,
            autoHeight: true,
            items: [{
                xtype: "gxp_embedmapdialog",
                url: this.rest + this.mapID + "/embed" 
            }]
        }).show();
    },

    /** private: method[initMetadataForm]
     *
     * Initialize metadata entry form.
     */
    initMetadataForm: function(){
        
        var titleField = new Ext.form.TextField({
            width: '95%',
            fieldLabel: this.metaDataMapTitle,
            value: this.about.title,
            allowBlank: false,
            enableKeyEvents: true,
            listeners: {
                "valid": function() {
                    saveAsButton.enable();
                    saveButton.enable();
                },
                "invalid": function() {
                    saveAsButton.disable();
                    saveButton.disable();
                }
            }
        });

        var abstractField = new Ext.form.TextArea({
            width: '95%',
            height: 200,
            fieldLabel: this.metaDataMapAbstract,
            value: this.about["abstract"]
        });

        var metaDataPanel = new Ext.FormPanel({
            bodyStyle: {padding: "5px"},          
            labelAlign: "top",
            items: [
                titleField,
                abstractField
            ]
        });

        metaDataPanel.enable();
        
        var saveAsButton = new Ext.Button({
            text: this.metadataFormSaveAsCopyText,
            disabled: !this.about.title,
            handler: function(e){
                this.about.title = titleField.getValue();
                this.about["abstract"] = abstractField.getValue();
                this.metadataForm.hide();
                this.save(true);
            },
            scope: this
        });
        var saveButton = new Ext.Button({
            text: this.metadataFormSaveText,
            disabled: !this.about.title,
            handler: function(e){
                this.about.title = titleField.getValue();
                this.about["abstract"] = abstractField.getValue();
                this.metadataForm.hide();
                this.save();
            },
            scope: this
        });

        this.metadataForm = new Ext.Window({
            title: this.metaDataHeader,
            closeAction: 'hide',
            items: metaDataPanel,
            modal: true,
            width: 400,
            autoHeight: true,
            bbar: [
                "->",
                saveAsButton,
                saveButton,
                new Ext.Button({
                    text: this.metadataFormCancelText,
                    handler: function() {
                        titleField.setValue(this.about.title);
                        abstractField.setValue(this.about["abstract"]);
                        this.metadataForm.hide();
                    },
                    scope: this
                })
            ]
        });
    },

    /** private: method[showMetadataForm]
     *  Shows the window with a metadata form
     */
    showMetadataForm: function() {
        if(!this.metadataForm) {
            this.initMetadataForm();
        }

        this.metadataForm.show();
    },

    updateURL: function() {
        /* PUT to this url to update an existing map */
        return this.rest + this.mapID + '/data';
    },

    /** api: method[save]
     *  :arg as: ''Boolean'' True if map should be "Saved as..."
     *
     *  Subclasses that load config asynchronously can override this to load
     *  any configuration before applyConfig is called.
     */
    save: function(as){
        var config = this.getState();
        
        if (!this.mapID || as) {
            /* create a new map */ 
            Ext.Ajax.request({
                url: this.rest,
                method: 'POST',
                jsonData: config,
                success: function(response, options) {
                    var id = response.getResponseHeader("Location");
                    // trim whitespace to avoid Safari issue where the trailing newline is included
                    id = id.replace(/^\s*/,'');
                    id = id.replace(/\s*$/,'');
                    id = id.match(/[\d]*$/)[0];
                    this.mapID = id; //id is url, not mapID
                    this.fireEvent("saved", id);
                }, 
                scope: this
            });
        }
        else {
            /* save an existing map */
            Ext.Ajax.request({
                url: this.updateURL(),
                method: 'PUT',
                jsonData: config,
                success: function(response, options) {
                    /* nothing for now */
                    this.fireEvent("saved", this.mapID);
                }, 
                scope: this
            });         
        }
    }
});

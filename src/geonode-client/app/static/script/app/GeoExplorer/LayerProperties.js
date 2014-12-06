Ext.namespace("GeoExplorer.plugins");

GeoExplorer.plugins.LayerProperties = Ext.extend(gxp.plugins.LayerProperties, {

    /** api: ptype = app_layerproperties */
    ptype: "app_layerproperties",

    addOutput: function(config) {
        var record = this.target.selectedLayer;
        var layer = record.getLayer();
        if(layer.dimensions && layer.dimensions.time){
        	record.set('properties','app_timelayerpanel');
        }
        GeoExplorer.plugins.LayerProperties.superclass.addOutput.call(this,config);
    }
});

Ext.preg(GeoExplorer.plugins.LayerProperties.prototype.ptype, GeoExplorer.plugins.LayerProperties);

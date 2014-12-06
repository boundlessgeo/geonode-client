Ext.namespace("GeoExplorer.plugins");

GeoExplorer.plugins.ScaleOverlay = Ext.extend(gxp.plugins.Tool, {

    /** api: ptype = app_notes */
    ptype: "app_scaleoverlay",
    
    addOutput: function(config){
        config = Ext.applyIf(config || this.outputConfig ||{}, {
            xtype: 'gxp_scaleoverlay',
            map: this.target.mapPanel
        });
        var overlay = GeoExplorer.plugins.ScaleOverlay.superclass.addOutput.call(this,config);
        return overlay;
    }
});

Ext.preg(GeoExplorer.plugins.ScaleOverlay.prototype.ptype, GeoExplorer.plugins.ScaleOverlay);
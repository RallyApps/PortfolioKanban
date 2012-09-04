(function() {
    var Ext = window.Ext4 || window.Ext;

    /**
     * A dialog that shows the settings for an app.
     *
     *
     *     @example
     *     Ext.create('Rally.ui.dialog.AppSettingsDialog', {
     *         
     *     }).show();
     */
    Ext.define('Rally.ui.dialog.AppSettingsDialog', {
        extend: 'Rally.ui.dialog.Dialog',
        alias:'widget.rallyappsettingsdialog',

        width: 350,
        closable: true,

        config: {
            /**
             * @cfg {String}
             * Title to give to the dialog
             */
            title: 'Settings',

            settings: {},

            fields: {},

            context: undefined,

            /**
             * @cfg {Object}
             * Scope to call the continueFn with
             */
            scope: undefined
        },

        constructor: function(config) {
            this.mergeConfig(config);
            this.callParent(arguments);
        },

        initComponent: function() {
            this.callParent(arguments);

            this.addEvents(
                /**
                 * @event
                 * Fired when the settings have been saved and the app view should show again.
                 * @param {Object} settings the settings that were saved
                 */
                'save',

                /**
                 * @event
                 * Fired when the cancel button has been clicked and the app view should show again.
                 */
                'cancel'
            );

            var appSettings = Ext.create('Rally.app.AppSettings', {
                settings: this.getSettings(),
                fields: this.getFields(),
                context: this.getContext(),
                listeners: {
                    save: function(settings){
                        this.fireEvent('save', settings);
                        this.close();
                    },
                    cancel: function(){
                        this.fireEvent('cancel');
                        this.close();
                    },
                    scope: this
                }
            });

            this.add(appSettings);
        }

    });

})();
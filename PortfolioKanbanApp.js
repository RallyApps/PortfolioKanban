(function () {
    var Ext = window.Ext4 || window.Ext;

    /**
     * PI Kanban Board App
     * Displays a cardboard and a type selector. Board shows States for the selected Type.
     */
    Ext.define('Rally.app.portfoliokanban.PortfolioKanbanApp', {
        extend:'Rally.app.App',
        layout:'auto',
        appName:'Portfolio Kanban',

        cls:'portfolio-kanban',

        config: {
            defaultSettings: {
                fields: 'PercentDoneByStoryCount'
            }
        },

        clientMetrics: [
            {
                method: '_showHelp',
                defaultUserAction: 'portfolio-kanban-show-help'
            }
        ],

        items:[
            {
                xtype:'container',
                itemId:'header',
                cls:'header'
            },
            {
                xtype:'container',
                itemId:'bodyContainer',
                width:'100%'
            }
        ],

        /**
         * @override
         */
        launch:function () {
            
            this.appContext = this.getContext().getDataContext();
            this._queryForType(this.getSetting('type'));
        },

        setType: function(type) {
            if(!type){
                this._queryForType();
                return;
            }

            this.currentType = type;

            this._drawHeader();
            this._loadCardboard();
        },
        
        _drawHeader: function(){
            var header = this.down('#header');

            var settingsLink = this._buildSettingsLink();

            header.add([
                this._buildHelpComponent(),
                this._buildShowPolicies(),
                this._buildFilterInfo(),
                this._buildSettingsLink()
            ]);
        },

        _buildSettingsLink: function(){
            return Ext.widget('component', {
                cls: 'appSettingsLink',
                renderTpl: '<a href="#">Settings</a>',
                renderSelectors: {
                    link: 'a'
                },
                listeners: {
                    click: {
                        element: 'link',
                        fn: function(){
                            Ext.widget('rallyappsettingsdialog', {
                                context: this.getContext(),
                                fields: [
                                    {
                                        type: 'type'
                                    }
                                ],
                                settings: this.getSettings(),
                                listeners: {
                                    save: function(settings){
                                        this.setSettings(settings);
                                        this._reloadApp();
                                    },
                                    scope: this
                                }
                            }).show();
                        },
                        stopEvent: true
                    },
                    scope: this
                }
            })
        },

        _reloadApp: function(){
            this.down('#bodyContainer').removeAll();
            this.down('#header').removeAll();
            this.launch();
        },

        _queryForType: function(typeRef) {
            var filters = [];
            if (typeRef) {
                filters.push({
                    property:'ObjectID',
                    value:Rally.util.Ref.getOidFromRef(typeRef)
                });
            } else {
                filters.push({
                    property:'Ordinal',
                    value:'0'
                });
            }

            this.typeStore = Ext.create('Rally.data.WsapiDataStore', {
                model: 'TypeDefinition',
                autoLoad: true,
                context: this.getContext().getDataContext(),
                filters: filters,
                listeners:{
                    load: function(data) {
                        var type = data.getAt(0);
                        this.setType(type);
                    },
                    scope:this
                }
            });
        },

        _loadCardboard:function () {
            this._loadStates({
                success:function (states) {
                    this._drawCardboard(this._createColumns(states));
                },
                scope:this
            });

        },

        /**
         * @private
         * We need the States of the selected Portfolio Item Type to know what columns to show.
         * Whenever the type changes, reload the states to redraw the cardboard.
         * @param options
         * @param options.success called when states are loaded
         * @param options.scope the scope to call success with
         */
        _loadStates:function (options) {
            Ext.create('Rally.data.WsapiDataStore', {
                model:'State',
                context:this.getContext().getDataContext(),
                autoLoad:true,
                fetch:['Name', 'WIPLimit', 'Description'],
                filters:[
                    {
                        property: 'TypeDef',
                        value:this.currentType.get('_ref')
                    },
                    {
                        property:'Enabled',
                        value:true
                    }
                ],
                sorters:[
                    {
                        property:'OrderIndex',
                        direction:'ASC'
                    }
                ],
                listeners:{
                    load:function (store, records) {
                        if (options.success) {
                            options.success.call(options.scope || this, records);
                        }
                    }
                }
            });

        },

        /**
         * Given a set of columns, build a cardboard component. Otherwise show an empty message.
         * @param columns
         */
        _drawCardboard:function (columns) {
            if(columns) {
                this._showColumns(columns);
            }
            else {
                this._showNoColumns();
            }
        },

        _showColumns: function(columns) {
            var cardboard = this.down('#cardboard');
            if (cardboard) {
                cardboard.destroy();
            }

            var columnConfig = {
                xtype:'rallykanbancolumn'
            };

            var cardConfig = {
                xtype:'rallyportfoliokanbancard'
            };

            var fields = this.getSetting('fields');

            if(fields) {
                columnConfig.additionalFetchFields = fields.split(',');
                cardConfig.fields = fields.split(',').sort();
            }

            cardboard = this.cardboard = Ext.widget('rallycardboard', {
                types: [this.currentType.get('TypePath')],
                itemId: 'cardboard',
                attribute: 'State',
                columns: columns,
                maxColumnsPerBoard: columns.length,
                ddGroup: this.currentType.get('TypePath'),
                enableRanking: this.getContext().get('workspace').WorkspaceConfiguration.DragDropRankingEnabled,
                columnConfig: columnConfig,
                cardConfig: cardConfig,
                storeConfig:{
                    filters:[
                        {
                            property:'PortfolioItemType',
                            value:this.currentType.get('_ref')
                        }
                    ],
                    context: this.context.getDataContext()
                },
                listeners:{
                    aftercarddroppedsave:function () {
                        Rally.alm && Rally.environment.getMessageBus().publish(Rally.alm.Message.contentUpdated);
                    },
                    load:function () {
                        Rally.alm && Rally.environment.getMessageBus().publish(Rally.alm.Message.contentUpdated);
                    },
                    scope:this
                },

                loadDescription:'Portfolio Kanban'
            });

            this.down('#bodyContainer').add(cardboard);

            this._attachPercentDoneToolTip(cardboard);

            this._renderPolicies();
            Ext.EventManager.onWindowResize(cardboard.resizeAllColumns, cardboard);
        },

        _showNoColumns:function () {
            this.add({
                xtype:'container',
                cls:'no-type-text',
                html:'<p>This Type has no states defined.</p>'
            });
        },

        /**
         * @private
         * @return columns for the cardboard, as a map with keys being the column name.
         */
        _createColumns:function (states) {
            if(!states.length) {
                return undefined;
            }

            var columns = [
                    {
                        displayValue:'No Entry',
                        value:null,
                        cardLimit:50,
                        showPolicies:false,
                        enablePolicies:true
                    }
                ];

            Ext.Array.each(states, function (state) {
                columns.push({
                    value:state.get('_ref'),
                    displayValue:state.get('Name'),
                    wipLimit:state.get('WIPLimit'),
                    stateRecord:state,
                    showPolicies:false,
                    enablePolicies:true
                });
            });

            return columns;
        },

        _attachPercentDoneToolTip:function (cardboard) {
            Ext.create('Rally.ui.tooltip.PercentDoneToolTip', {
                target:cardboard.getEl(),
                delegate:'.percentDoneContainer',
                percentDoneName: 'PercentDoneByStoryCount',
                listeners:{
                    beforeshow:function (tip) {

                        var cardElement = Ext.get(tip.triggerElement).up('.rui-card');
                        var card = Ext.getCmp(cardElement.id);

                        tip.updateContent(card.getRecord().data);
                    },
                    scope:this
                }
            });
        },

        _renderPolicies:function () {
            var showPoliciesCheckbox = this.down("#showPoliciesCheckbox");

            Ext.each(this.cardboard.getColumns(), function (column) {
                column.togglePolicy(showPoliciesCheckbox.getValue());
            });

            this.cardboard.resizeAllColumns();
        },

        _buildShowPolicies:function () {
            return Ext.widget('checkbox', {
                cls:'showPolicies',
                itemId:'showPoliciesCheckbox',
                fieldCls:'showPoliciesCheckbox',
                boxLabel:"Show Policies",
                listeners:{
                    change:{
                        fn:this._renderPolicies,
                        scope:this
                    }
                }
            });

        },

        _buildHelpComponent:function (config) {
            return Ext.create('Ext.Component', Ext.apply({
                cls:Rally.util.Test.toBrowserTestCssClass('portfolio-kanban-help-container') + ' kanban-help ',
                renderTpl:'<a href="#" title="Launch Help"></a>',
                listeners:{
                    click:{
                        element:'el',
                        fn: function(){
                            Rally.alm.util.Help.launchHelp({
                                id:265
                            });
                        },
                        stopEvent:true
                    },
                    scope:this
                }
            }, config));
        },

        _buildFilterInfo: function(){
            var filterInfo = Ext.widget('component', {
                itemId: 'filterInfo',
                cls: 'filterInfo',
                renderTpl: '<a></a>',
                renderSelectors: {
                    link: 'a'
                }
            });

            filterInfo.on('afterrender', function(){
                this._initFilterInfoTooltip();
            }, this);

            return filterInfo;
        },

        _initFilterInfoTooltip: function(){
            var me = this;
            this.filterInfoTooltip = Ext.create('Rally.ui.tooltip.ToolTip', {
                cls: 'filterInfoTooltip',
                width: 200,
                target: this.down('#filterInfo').getEl().down('a'),
                anchor: 'top',
                anchorOffset: 150,
                getTargetXY: function(){
                    var filterPosition = me.down('#filterInfo').getEl().getXY();
                    return [filterPosition[0]-160, filterPosition[1]+26];
                },
                listeners: {
                    beforeShow: function(tip){
                        tip.update(me._getFilterTooltipContent());
                    }
                }
            });
        },

        _getFilterTooltipContent: function(){
            var tplData = {};

            if(this.getSetting('project')){
                tplData.project = this.getContext().get('project').Name;
            }
            if(this.currentType){
                tplData.type = this.currentType.get('Name');
            }

            var scopeUp = this.getSetting('projectScopeUp') == 'true';
            var scopeDown = this.getSetting('projectScopeDown') == 'true';

            if(scopeUp && scopeDown){
                tplData.scopingCls = 'scopeUpAndDown';
            } else if(scopeUp){
                tplData.scopingCls = 'scopeUp';
            } else if(scopeDown){
                tplData.scopingCls = 'scopeDown';
            } else {
                tplData.scopingCls = 'noScope';
            }

            return Ext.create('Ext.XTemplate',
                    '<tpl if="project">',
                        '<div class="filterInfoTooltipLineItem">',
                            '<label>Project:</label>',
                            '<span>{project}</span>',
                            '<span class="{scopingCls}"></span>',
                        '</div>',
                    '</tpl>',
                    '<tpl if="type">',
                        '<div class="filterInfoTooltipLineItem">',
                            '<label>Type:</label> ',
                            '<span>{type}</span>',
                        '</div>',
                    '</tpl>'
            ).apply(tplData);
        }
    });
})();

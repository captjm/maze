// src/components/GraphEditor/NodePropertyPanel.tsx
import type {TimelineGraph, TimelineNode} from "../../timeline/types.ts";
import styles from "./NodePropertyPanel.module.css";
import React, {useEffect, useState} from "react";
import {accent} from "./helpers.ts";
import clsx from "clsx";

interface NodePanelProps {
    node: TimelineNode;
    graph: TimelineGraph;
    onClose: () => void;
    onSave: (oldId: string, updated: TimelineNode) => void;
    onDelete: (id: string) => void;
    onSetEntry: (id: string) => void;
    onPreview: (id: string) => Promise<void>;
    onGraphChange: (graph: TimelineGraph) => void;
}

export const NodePropertyPanel = ({
                                      node,
                                      graph,
                                      onClose,
                                      onSave,
                                      onDelete,
                                      onSetEntry,
                                      onPreview,
                                      onGraphChange
                                  }: NodePanelProps) => {
    const [idVal, setIdVal] = useState(node.id);
    const [srcVal, setSrcVal] = useState(node.source);

    useEffect(() => {
        setIdVal(node.id);
        setSrcVal(node.source);
    }, [node]);

    const isEntry = graph.entry === node.id;
    const allIds = [...graph.nodes.keys()].filter(k => k !== node.id);

    return (
        <div className={styles.panel}>
            <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10}}>
                <span style={{fontSize: 9, letterSpacing: 2, color: "#50507a"}}>NODE EDITOR</span>
                <button onClick={onClose}
                        className={styles.iconBtn}>✕
                </button>
            </div>

            <label className={styles.lbl}>ID</label>
            <input value={idVal}
                   onChange={e => setIdVal(e.target.value)}
                   className={styles.inp}/>

            <label className={styles.lbl}>Source</label>
            <input value={srcVal}
                   onChange={e => setSrcVal(e.target.value)}
                   className={styles.inp}/>

            <label className={styles.lbl}>Outputs</label>
            <div style={{display: "flex", flexDirection: "column", gap: 4, marginBottom: 6}}>
                {node.outputs.map((outId, idx) => (
                    <div key={idx} style={{display: "flex", gap: 4, alignItems: "center"}}>
                        <span style={{flex: 1, color: accent(outId), fontSize: 10}}>{outId}</span>
                        <button onClick={() => {
                            node.outputs.splice(idx, 1);
                            onGraphChange({...graph});
                        }} className={clsx(styles.iconBtn, styles.iconBtnRed)}>✕
                        </button>
                    </div>
                ))}
            </div>

            <div style={{display: "flex", gap: 4, marginBottom: 10}}>
                <select
                    value=""
                    onChange={e => {
                        if (e.target.value && !node.outputs.includes(e.target.value)) {
                            node.outputs.push(e.target.value);
                            onGraphChange({...graph});
                        }
                    }}
                    className={styles.inpStyle}
                    style={{cursor: "pointer"}}
                >
                    <option value="">+ add edge to...</option>
                    {allIds.filter(k => !node.outputs.includes(k)).map(k => (
                        <option key={k} value={k}>{k}</option>
                    ))}
                </select>
            </div>

            <div style={{display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10}}>
                <button onClick={() => onPreview(node.id)}
                        className={clsx(styles.actBtn, styles.actBtnGreen)}>▶ Preview
                </button>
                {!isEntry ? (
                    <button onClick={() => onSetEntry(node.id)}
                            className={clsx(styles.actBtn, styles.actBtnYellow)}>★ Set Entry</button>
                ) : (
                    <span style={{fontSize: 9, color: "#f59e0b", alignSelf: "center"}}>★ ENTRY</span>
                )}
                <button onClick={() => onDelete(node.id)}
                        className={clsx(styles.actBtn, styles.actBtnRed)}>🗑 Delete
                </button>
            </div>

            <div style={{borderTop: "1px solid #1a1a2e", paddingTop: 8, marginTop: 4}}>
                <button
                    onClick={() => {
                        const updatedNode: TimelineNode = {
                            id: idVal.trim(),
                            source: srcVal.trim(),
                            outputs: [...node.outputs]
                        };
                        onSave(node.id, updatedNode);
                    }}
                    className={clsx(styles.actBtn, styles.actBtnBlue)}
                    style={{width: "100%"}}
                >
                    ✓ Apply Changes
                </button>
            </div>
        </div>
    );
}
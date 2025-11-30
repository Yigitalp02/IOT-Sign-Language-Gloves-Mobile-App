import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, FlatList } from 'react-native';
import { useTheme } from '../context/ThemeContext';

interface Option {
    label: string;
    value: string;
}

interface DropdownProps {
    label: string;
    value: string;
    options: Option[];
    onSelect: (value: string) => void;
}

export default function Dropdown({ label, value, options, onSelect }: DropdownProps) {
    const { colors } = useTheme();
    const [visible, setVisible] = useState(false);

    const selectedOption = options.find((opt) => opt.value === value);

    return (
        <View>
            <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
            <TouchableOpacity
                style={[styles.button, { backgroundColor: colors.inputBg, borderColor: colors.borderColor }]}
                onPress={() => setVisible(true)}
            >
                <Text style={[styles.buttonText, { color: colors.textPrimary }]}>
                    {selectedOption ? selectedOption.label : 'Select'}
                </Text>
                <Text style={[styles.icon, { color: colors.textSecondary }]}>▼</Text>
            </TouchableOpacity>

            <Modal visible={visible} transparent animationType="fade">
                <TouchableOpacity
                    style={styles.overlay}
                    activeOpacity={1}
                    onPress={() => setVisible(false)}
                >
                    <View style={[styles.dropdown, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
                        <FlatList
                            data={options}
                            keyExtractor={(item) => item.value}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={[
                                        styles.item,
                                        {
                                            backgroundColor: item.value === value ? colors.statusBg : 'transparent',
                                            borderBottomColor: colors.borderColor,
                                        },
                                    ]}
                                    onPress={() => {
                                        onSelect(item.value);
                                        setVisible(false);
                                    }}
                                >
                                    <Text
                                        style={[
                                            styles.itemText,
                                            {
                                                color: item.value === value ? colors.accentPrimary : colors.textPrimary,
                                                fontWeight: item.value === value ? '600' : '400',
                                            },
                                        ]}
                                    >
                                        {item.label}
                                    </Text>
                                </TouchableOpacity>
                            )}
                        />
                    </View>
                </TouchableOpacity>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    label: {
        fontSize: 12,
        marginBottom: 4,
        marginLeft: 4,
    },
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 1,
        minWidth: 140,
    },
    buttonText: {
        fontSize: 14,
    },
    icon: {
        fontSize: 10,
        marginLeft: 8,
    },
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    dropdown: {
        width: '80%',
        maxHeight: 300,
        borderRadius: 12,
        borderWidth: 1,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 10,
    },
    item: {
        padding: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    itemText: {
        fontSize: 16,
    },
});
